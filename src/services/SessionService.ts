import { deriveKeyPairFromSeed } from '@/infrastructure/crypto/webcrypto';
import { DiscoveryService } from '@/services/discovery/DiscoveryService';
import { DiscoveryStrategyRegistry } from '@/infrastructure/discovery/DiscoveryStrategyRegistry';
import { HandshakeService } from '@/services/messaging/HandshakeService';
import { ProfileExchangeService } from '@/services/profile/ProfileExchangeService';
import { MediaExchangeService } from '@/services/media/MediaExchangeService';
import { MessagingService } from '@/services/messaging/MessagingService';
import { MessageSyncService } from '@/services/messaging/MessageSyncService';
import { MatchingService } from '@/services/matching/MatchingService';
import { SafetyService } from '@/services/safety/SafetyService';
import { ConnectionService } from '@/services/connection/ConnectionService';
import type { Identity, Device, Profile } from '@/types/db';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SessionService');

export type SessionStatus = 'idle' | 'starting' | 'active' | 'error';

export interface SessionState {
  status: SessionStatus;
  accountId: string | null;
  activeRooms: string[];
  peerCount: number;
  error: string | null;
}

const initialState: SessionState = {
  status: 'idle',
  accountId: null,
  activeRooms: [],
  peerCount: 0,
  error: null,
};

let _state: SessionState = { ...initialState };
let _unsubscribers: Array<() => void> = [];
let _peerCountInterval: ReturnType<typeof setInterval> | null = null;
let _privateKey: CryptoKey | null = null;

/** Derives the CryptoKey from raw base64 entropy stored in identity.privateKey. */
async function deriveSigningKey(entropyBase64: string): Promise<CryptoKey> {
  const binary = atob(entropyBase64);
  const entropy = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) entropy[i] = binary.charCodeAt(i);
  const keyPair = await deriveKeyPairFromSeed(entropy);
  return keyPair.privateKey;
}

function getRoomForPeer(peerId: string): string | undefined {
  return DiscoveryStrategyRegistry.get().getRoomForPeer?.(peerId);
}

export const SessionService = {
  /**
   * Starts a full session:
   * 1. Derives signing key from stored entropy
   * 2. Joins discovery rooms for current location
   * 3. Broadcasts HELLO to all rooms
   * 4. Starts all protocol listeners
   */
  async start(identity: Identity, device: Device, profile?: Profile): Promise<SessionState> {
    if (_state.status === 'active') return _state;

    _state = { ...initialState, status: 'starting', accountId: identity.id };
    logger.info('Session starting', { accountId: identity.id });

    try {
      const privateKey = await deriveSigningKey(identity.privateKey);
      const publicKey = identity.publicKey;

      // Join discovery rooms
      const ctx = await DiscoveryService.startDiscovery(identity.id);

      _privateKey = privateKey;

      // Start listeners BEFORE HELLO. A peer can answer immediately after connecting.
      const strategy = DiscoveryStrategyRegistry.get();
      _unsubscribers = [
        HandshakeService.startListening(identity.id, privateKey, getRoomForPeer),
        ProfileExchangeService.startListening(identity.id, privateKey, getRoomForPeer),
        MediaExchangeService.startListening(identity.id, privateKey, getRoomForPeer),
        MessagingService.onMessage(identity.id, privateKey, getRoomForPeer, () => {}),
        MessagingService.onAck(),
        MatchingService.onLike(identity.id, privateKey, '', getRoomForPeer),
        MatchingService.onMatch((payload, fromPeerId, fromAccountId) => {
          MatchingService.acceptIncomingMatch(identity.id, payload, fromAccountId);
          logger.info('MATCH received', { fromPeerId, fromAccountId, conversationId: payload.conversationId });
        }),
        MessageSyncService.startListening(identity.id, privateKey, getRoomForPeer),
        strategy.onPeerJoin((peerId, roomId) => {
          ConnectionService.onPeerConnected(peerId, roomId, identity.id, privateKey);
          // Fetch the remote public profile as soon as WebRTC is ready.
          ProfileExchangeService.requestProfile(roomId, identity.id, privateKey, peerId)
            .catch((err) => logger.debug('Profile request failed', { peerId, roomId, error: String(err) }));
        }),
        strategy.onPeerLeave((peerId) => ConnectionService.onPeerDisconnected(peerId)),
      ];

      // Announce only after listeners are installed.
      for (const roomId of ctx.activeRooms) {
        await HandshakeService.broadcastHello(roomId, identity.id, publicKey, device.id, privateKey, profile?.displayName);
      }

      // Refresh peer count every 1s while the UI is open.
      _peerCountInterval = setInterval(() => { _state = { ..._state, ...DiscoveryService.getContext() }; }, 1_000);

      _state = {
        status: 'active',
        accountId: identity.id,
        activeRooms: ctx.activeRooms,
        peerCount: ctx.peerCount,
        error: null,
      };

      logger.info('Session active', { rooms: ctx.activeRooms.length, peers: ctx.peerCount });
      return _state;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Session start failed';
      _state = { ...initialState, status: 'error', error };
      logger.error('Session start failed', { error });
      throw err;
    }
  },

  /**
   * Stops the session — leaves all rooms, stops all listeners, clears state.
   */
  async stop(): Promise<void> {
    if (_peerCountInterval) {
      clearInterval(_peerCountInterval);
      _peerCountInterval = null;
    }

    for (const unsub of _unsubscribers) unsub();
    _unsubscribers = [];

    await DiscoveryService.stopDiscovery();
    HandshakeService.clearRegistry();
    ProfileExchangeService.clearCache();
    MediaExchangeService.clearPending();
    SafetyService.clearMutes();
    ConnectionService.clear();
    _privateKey = null;

    _state = { ...initialState };
    logger.info('Session stopped');
  },

  getState(): SessionState {
    return _state;
  },

  /** Refreshes peer count from transport (called by hook on interval). */
  refreshPeerCount(): void {
    if (_state.status !== 'active') return;
    _state = { ..._state, ...DiscoveryService.getContext() };
  },

  getDiscoveredProfiles() { return ProfileExchangeService.getCachedProfiles(); },

  async likePeer(peerId: string, h3Index: string): Promise<void> {
    if (!_privateKey || !_state.accountId) throw new Error('Session is not active');
    const strategy = DiscoveryStrategyRegistry.get();
    const roomId = strategy.getRoomForPeer?.(peerId);
    const discovered = ProfileExchangeService.getCachedProfiles().find((entry) => entry.peerId === peerId);
    if (!roomId || !discovered) throw new Error('Peer is no longer connected');
    await MatchingService.sendLike(roomId, _state.accountId, _privateKey, discovered.profile.accountId, h3Index, peerId);
  },

  async passPeer(peerId: string, h3Index: string): Promise<void> {
    if (!_privateKey || !_state.accountId) throw new Error('Session is not active');
    const strategy = DiscoveryStrategyRegistry.get();
    const roomId = strategy.getRoomForPeer?.(peerId);
    const discovered = ProfileExchangeService.getCachedProfiles().find((entry) => entry.peerId === peerId);
    if (!roomId || !discovered) throw new Error('Peer is no longer connected');
    await MatchingService.sendPass(roomId, _state.accountId, _privateKey, discovered.profile.accountId, h3Index, peerId);
  },

  /** Resets internal state — used in tests. */
  _reset(): void {
    _state = { ...initialState };
    _unsubscribers = [];
    _privateKey = null;
    if (_peerCountInterval) {
      clearInterval(_peerCountInterval);
      _peerCountInterval = null;
    }
  },
};

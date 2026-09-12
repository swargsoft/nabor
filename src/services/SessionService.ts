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

/** Derives the CryptoKey from raw base64 entropy stored in identity.privateKey. */
async function deriveSigningKey(entropyBase64: string): Promise<CryptoKey> {
  const binary = atob(entropyBase64);
  const entropy = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) entropy[i] = binary.charCodeAt(i);
  const keyPair = await deriveKeyPairFromSeed(entropy);
  return keyPair.privateKey;
}

function getRoomForPeer(peerId: string): string | undefined {
  const strategy = DiscoveryStrategyRegistry.get();
  return strategy.getRoomsForPeer?.(peerId)[0];
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

      // Start listeners BEFORE sending HELLO. This avoids dropping the first
      // identity packet when the other peer is already connected.
      const strategy = DiscoveryStrategyRegistry.get();
      _unsubscribers = [
        HandshakeService.startListening(identity.id, privateKey, getRoomForPeer),
        ProfileExchangeService.startListening(identity.id, privateKey, getRoomForPeer),
        MediaExchangeService.startListening(identity.id, privateKey, getRoomForPeer),
        MessagingService.onMessage(identity.id, privateKey, getRoomForPeer, () => {}),
        MessagingService.onAck(),
        MatchingService.onLike(identity.id, privateKey, '', getRoomForPeer),
        MatchingService.onMatch(() => {}),
        MessageSyncService.startListening(identity.id, privateKey, getRoomForPeer),
        strategy.onPeerJoin((peerId, roomId) => {
          ConnectionService.onPeerConnected(peerId, roomId, identity.id, privateKey);
          // A peer that joins after our initial announcement still needs our
          // identity. Send HELLO directly to the newly connected peer.
          void HandshakeService.broadcastHello(
            roomId, identity.id, publicKey, device.id, privateKey, profile?.displayName,
          );
        }),
        strategy.onPeerLeave((peerId) =>
          ConnectionService.onPeerDisconnected(peerId),
        ),
      ];

      // Announce on every active room after listeners are ready.
      for (const roomId of ctx.activeRooms) {
        await HandshakeService.broadcastHello(
          roomId, identity.id, publicKey, device.id, privateKey, profile?.displayName,
        );
      }

      // Refresh peer count every 1s so the session state becomes live quickly.
      _peerCountInterval = setInterval(() => {
        _state = { ..._state, ...DiscoveryService.getContext() };
      }, 1_000);

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

  /** Resets internal state — used in tests. */
  _reset(): void {
    _state = { ...initialState };
    _unsubscribers = [];
    if (_peerCountInterval) {
      clearInterval(_peerCountInterval);
      _peerCountInterval = null;
    }
  },
};

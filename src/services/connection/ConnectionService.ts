import { MessageSyncService } from '@/services/messaging/MessageSyncService';
import { ConversationRepository } from '@/repositories/ConversationRepository';
import { MessageRepository } from '@/repositories/MessageRepository';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ConnectionService');

export type PeerConnectionState = 'connected' | 'disconnected' | 'reconnecting';

export type ConnectionStateHandler = (peerId: string, state: PeerConnectionState) => void;

interface PeerEntry {
  state: PeerConnectionState;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

/** How long to wait before marking a disconnected peer as reconnecting (ms). */
const RECONNECT_WINDOW_MS = 10_000;

const peerStates = new Map<string, PeerEntry>();
const stateHandlers: ConnectionStateHandler[] = [];

export const ConnectionService = {
  /**
   * Called when a peer joins a room.
   * If they were previously disconnected/reconnecting, triggers sync + message retry.
   */
  onPeerConnected(
    peerId: string,
    roomId: string,
    accountId: string,
    privateKey: CryptoKey,
  ): void {
    const existing = peerStates.get(peerId);
    const wasAway = existing && existing.state !== 'connected';

    // Clear any pending reconnect timer
    if (existing?.reconnectTimer) {
      clearTimeout(existing.reconnectTimer);
    }

    peerStates.set(peerId, { state: 'connected', reconnectTimer: null });
    _emit(peerId, 'connected');
    logger.info('Peer connected', { peerId, roomId });

    if (wasAway) {
      // Trigger sync and retry in background — don't block the join handler
      _syncAndRetry(peerId, roomId, accountId, privateKey).catch((err) => {
        logger.warn('Sync/retry failed after reconnect', { peerId, error: String(err) });
      });
    }
  },

  /**
   * Called when a peer leaves a room.
   * Starts a reconnect window — if they don't come back, marks as disconnected.
   */
  onPeerDisconnected(peerId: string): void {
    const existing = peerStates.get(peerId);
    if (existing?.reconnectTimer) clearTimeout(existing.reconnectTimer);

    const timer = setTimeout(() => {
      const entry = peerStates.get(peerId);
      if (entry && entry.state === 'reconnecting') {
        peerStates.set(peerId, { state: 'disconnected', reconnectTimer: null });
        _emit(peerId, 'disconnected');
        logger.info('Peer disconnected (timeout)', { peerId });
      }
    }, RECONNECT_WINDOW_MS);

    peerStates.set(peerId, { state: 'reconnecting', reconnectTimer: timer });
    _emit(peerId, 'reconnecting');
    logger.info('Peer reconnecting', { peerId });
  },

  /** Returns the current connection state for a peer. */
  getState(peerId: string): PeerConnectionState | null {
    return peerStates.get(peerId)?.state ?? null;
  },

  /** Registers a handler called whenever any peer's connection state changes. */
  onStateChange(handler: ConnectionStateHandler): () => void {
    stateHandlers.push(handler);
    return () => {
      const idx = stateHandlers.indexOf(handler);
      if (idx !== -1) stateHandlers.splice(idx, 1);
    };
  },

  /** Clears all tracked peer states and timers (called on session stop). */
  clear(): void {
    for (const entry of peerStates.values()) {
      if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
    }
    peerStates.clear();
    stateHandlers.length = 0;
  },
};

// ─── Internal ─────────────────────────────────────────────────────────────────

function _emit(peerId: string, state: PeerConnectionState): void {
  for (const h of stateHandlers) h(peerId, state);
}

/**
 * On reconnect: request sync for every conversation with this peer,
 * and retry any messages stuck in 'sending' status.
 */
async function _syncAndRetry(
  peerId: string,
  roomId: string,
  accountId: string,
  privateKey: CryptoKey,
): Promise<void> {
  // Find all conversations with this peer
  const conversations = await ConversationRepository.getAll();
  const peerConvs = conversations.filter((c) => c.peerId === peerId);

  for (const conv of peerConvs) {
    await MessageSyncService.requestSync(roomId, accountId, privateKey, peerId, conv.id);
  }

  // Retry messages stuck in 'sending' for this peer's conversations
  const convIds = new Set(peerConvs.map((c) => c.id));
  const sendingMessages = await MessageRepository.getByStatus('sending');
  for (const msg of sendingMessages) {
    if (convIds.has(msg.conversationId)) {
      // Mark as failed — the UI can surface this; a future stage can re-send
      await MessageRepository.save({ ...msg, status: 'sent' });
      logger.debug('Stuck sending message advanced to sent on reconnect', { messageId: msg.id });
    }
  }
}

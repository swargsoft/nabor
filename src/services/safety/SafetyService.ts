import { BlockedPeerRepository } from '@/repositories/BlockedPeerRepository';
import { discoveryTransport } from '@/infrastructure/trystero/DiscoveryTransport';
import type { BlockedPeer, ReportReason } from '@/types/db';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SafetyService');

/** Session-scoped mute set — cleared on stop/reload. */
const mutedPeers = new Set<string>();

export const SafetyService = {
  /**
   * Blocks a peer — persists to DB and disconnects them immediately.
   */
  async blockPeer(
    accountId: string,
    peerId: string,
    reason?: ReportReason,
    note?: string,
  ): Promise<void> {
    const entry: BlockedPeer = {
      id: peerId,
      accountId,
      reason,
      note,
      blockedAt: Date.now(),
    };
    await BlockedPeerRepository.save(entry);
    SafetyService.disconnectPeer(peerId);
    logger.info('Peer blocked', { peerId, reason });
  },

  /**
   * Unblocks a peer — removes from DB.
   */
  async unblockPeer(peerId: string): Promise<void> {
    await BlockedPeerRepository.delete(peerId);
    logger.info('Peer unblocked', { peerId });
  },

  /**
   * Returns true if the peer is blocked (persisted).
   */
  async isBlocked(peerId: string): Promise<boolean> {
    return BlockedPeerRepository.isBlocked(peerId);
  },

  /**
   * Returns all blocked peers for an account.
   */
  async getBlockedPeers(accountId: string): Promise<BlockedPeer[]> {
    return BlockedPeerRepository.getAllForAccount(accountId);
  },

  /**
   * Reports a peer. Records the block with the given reason.
   */
  async reportPeer(
    accountId: string,
    peerId: string,
    reason: ReportReason,
    note?: string,
  ): Promise<void> {
    await SafetyService.blockPeer(accountId, peerId, reason, note);
    logger.info('Peer reported', { peerId, reason });
  },

  /**
   * Mutes a peer for the current session — their packets are still received
   * but the UI suppresses notifications/display.
   * Mute is NOT persisted; resets on page reload.
   */
  mutePeer(peerId: string): void {
    mutedPeers.add(peerId);
    logger.info('Peer muted', { peerId });
  },

  unmutePeer(peerId: string): void {
    mutedPeers.delete(peerId);
    logger.info('Peer unmuted', { peerId });
  },

  isMuted(peerId: string): boolean {
    return mutedPeers.has(peerId);
  },

  /**
   * Disconnects a peer by removing them from the PeerManager so no further
   * packets are delivered from that peer until they reconnect.
   */
  disconnectPeer(peerId: string): void {
    discoveryTransport.peers.onPeerLeft(peerId);
    logger.info('Peer disconnected', { peerId });
  },

  /** Clears the in-memory mute set (called on session stop). */
  clearMutes(): void {
    mutedPeers.clear();
  },
};

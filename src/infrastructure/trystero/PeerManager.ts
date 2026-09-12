import { createLogger } from '@/utils/logger';

const logger = createLogger('PeerManager');

export interface PeerInfo {
  peerId: string;
  roomId: string;
  connectedAt: number;
  roomIds: Set<string>;
}

/** Tracks unique WebRTC peers across all H3 discovery rooms. */
export class PeerManager {
  private readonly peers = new Map<string, PeerInfo>();

  onPeerJoined(peerId: string, roomId: string): void {
    const existing = this.peers.get(peerId);
    if (existing) {
      existing.roomIds.add(roomId);
      existing.roomId = roomId;
      logger.debug('Peer joined another room', { peerId, roomId, rooms: [...existing.roomIds] });
      return;
    }
    this.peers.set(peerId, {
      peerId,
      roomId,
      connectedAt: Date.now(),
      roomIds: new Set([roomId]),
    });
    logger.info('Peer connected', { peerId, roomId });
  }

  /** Returns true only when the peer has left its final room. */
  onPeerLeft(peerId: string, roomId?: string): boolean {
    const existing = this.peers.get(peerId);
    if (!existing) return true;
    // Without a roomId (legacy callers such as SafetyService/tests),
    // remove the peer completely. With a roomId, remove only that room.
    if (roomId === undefined) {
      this.peers.delete(peerId);
      logger.info('Peer disconnected', { peerId });
      return true;
    }
    existing.roomIds.delete(roomId);
    if (existing.roomIds.size > 0) {
      existing.roomId = [...existing.roomIds][0];
      logger.debug('Peer left one room', { peerId, roomId, remainingRooms: [...existing.roomIds] });
      return false;
    }
    this.peers.delete(peerId);
    logger.info('Peer disconnected', { peerId });
    return true;
  }

  getPeer(peerId: string): PeerInfo | undefined { return this.peers.get(peerId); }
  getPeersInRoom(roomId: string): PeerInfo[] {
    return [...this.peers.values()].filter((p) => p.roomIds.has(roomId));
  }
  getAllPeers(): PeerInfo[] { return [...this.peers.values()]; }
  getPeerCount(): number { return this.peers.size; }
  isConnected(peerId: string): boolean { return this.peers.has(peerId); }

  getRoomForPeer(peerId: string): string | undefined {
    return this.peers.get(peerId)?.roomId;
  }

  clear(): void { this.peers.clear(); }
}

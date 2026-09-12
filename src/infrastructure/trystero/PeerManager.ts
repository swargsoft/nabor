import { createLogger } from '@/utils/logger';

const logger = createLogger('PeerManager');

export interface PeerInfo {
  peerId: string;
  roomId: string;
  connectedAt: number;
}

/**
 * Tracks unique peers and every room in which they are currently connected.
 *
 * Trystero can reuse one underlying connection when the same peer appears in
 * multiple rooms. Keeping only one `peerId -> roomId` entry therefore loses
 * information and can make a peer disappear when it leaves just one room.
 */
export class PeerManager {
  private readonly peers = new Map<string, PeerInfo>();
  private readonly peerRooms = new Map<string, Set<string>>();

  onPeerJoined(peerId: string, roomId: string): void {
    let rooms = this.peerRooms.get(peerId);
    if (!rooms) {
      rooms = new Set<string>();
      this.peerRooms.set(peerId, rooms);
    }
    rooms.add(roomId);

    const existing = this.peers.get(peerId);
    this.peers.set(peerId, {
      peerId,
      roomId: existing?.roomId ?? roomId,
      connectedAt: existing?.connectedAt ?? Date.now(),
    });

    logger.info('Peer connected', { peerId, roomId, rooms: [...rooms] });
  }

  onPeerLeft(peerId: string, roomId?: string): void {
    const rooms = this.peerRooms.get(peerId);

    if (!rooms) {
      this.peers.delete(peerId);
      return;
    }

    if (roomId) {
      rooms.delete(roomId);
    } else {
      rooms.clear();
    }

    if (rooms.size === 0) {
      this.peerRooms.delete(peerId);
      this.peers.delete(peerId);
      logger.info('Peer disconnected', { peerId });
      return;
    }

    const firstRoom = rooms.values().next().value as string;
    const existing = this.peers.get(peerId);
    if (existing) this.peers.set(peerId, { ...existing, roomId: firstRoom });
    logger.info('Peer left room but remains connected', { peerId, roomId, remainingRooms: [...rooms] });
  }

  getPeer(peerId: string): PeerInfo | undefined {
    return this.peers.get(peerId);
  }

  getRoomsForPeer(peerId: string): string[] {
    return [...(this.peerRooms.get(peerId) ?? [])];
  }

  getPeersInRoom(roomId: string): PeerInfo[] {
    return [...this.peers.values()].filter((p) => this.peerRooms.get(p.peerId)?.has(roomId));
  }

  getAllPeers(): PeerInfo[] {
    return [...this.peers.values()];
  }

  getPeerCount(): number {
    return this.peers.size;
  }

  isConnected(peerId: string): boolean {
    return this.peers.has(peerId);
  }

  clear(): void {
    this.peers.clear();
    this.peerRooms.clear();
  }
}

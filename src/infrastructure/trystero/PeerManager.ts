import { createLogger } from '@/utils/logger';

const logger = createLogger('PeerManager');

export interface PeerInfo {
  peerId: string;
  roomId: string;
  connectedAt: number;
}

export class PeerManager {
  private readonly peers = new Map<string, PeerInfo>();

  onPeerJoined(peerId: string, roomId: string): void {
    this.peers.set(peerId, { peerId, roomId, connectedAt: Date.now() });
    logger.info('Peer connected', { peerId, roomId });
  }

  onPeerLeft(peerId: string): void {
    this.peers.delete(peerId);
    logger.info('Peer disconnected', { peerId });
  }

  getPeer(peerId: string): PeerInfo | undefined {
    return this.peers.get(peerId);
  }

  getPeersInRoom(roomId: string): PeerInfo[] {
    return [...this.peers.values()].filter((p) => p.roomId === roomId);
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
  }
}

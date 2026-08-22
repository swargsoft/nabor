import type { JsonValue } from '@trystero-p2p/core';
import { DiscoveryTransport } from '@/infrastructure/trystero/DiscoveryTransport';
import type { DiscoveryStrategy, Peer } from './DiscoveryStrategy';
import { createLogger } from '@/utils/logger';

const logger = createLogger('WebTorrentStrategy');

/**
 * Default discovery strategy using Trystero + WebTorrent + WebRTC.
 * Wraps DiscoveryTransport to satisfy the DiscoveryStrategy interface.
 */
export class WebTorrentStrategy implements DiscoveryStrategy {
  private readonly transport: DiscoveryTransport;

  constructor(transport: DiscoveryTransport) {
    this.transport = transport;
  }

  async join(room: string): Promise<void> {
    await this.transport.joinRoom(room);
    logger.debug('Joined room', { room });
  }

  async leave(room: string): Promise<void> {
    await this.transport.leaveRoom(room);
    logger.debug('Left room', { room });
  }

  async announce(room: string, data: JsonValue, targetPeerId?: string): Promise<void> {
    this.transport.send(room, data, targetPeerId);
  }

  async discover(room: string): Promise<Peer[]> {
    return this.transport.peers
      .getPeersInRoom(room)
      .map((peerId) => ({ id: peerId, roomId: room }));
  }

  onData(handler: (data: JsonValue, peerId: string, roomId: string) => void): () => void {
    return this.transport.onData(handler);
  }

  onPeerJoin(handler: (peerId: string, roomId: string) => void): () => void {
    return this.transport.onPeerJoin(handler);
  }

  onPeerLeave(handler: (peerId: string) => void): () => void {
    return this.transport.onPeerLeave(handler);
  }

  async leaveAll(): Promise<void> {
    await this.transport.leaveAll();
  }

  getRoomIds(): string[] {
    return this.transport.getRoomIds();
  }

  getPeerCount(): number {
    return this.transport.peers.getPeerCount();
  }
}

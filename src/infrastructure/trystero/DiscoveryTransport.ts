import { RoomManager } from '@/infrastructure/trystero/RoomManager';
import { PeerManager } from '@/infrastructure/trystero/PeerManager';
import type { JsonValue } from '@trystero-p2p/core';
import { createLogger } from '@/utils/logger';

const logger = createLogger('DiscoveryTransport');

const APP_ID = 'nabor-v1';

export type IncomingDataHandler = (data: JsonValue, peerId: string, roomId: string) => void;
export type PeerEventHandler = (peerId: string, roomId: string) => void;
export type PeerLeaveHandler = (peerId: string) => void;

export class DiscoveryTransport {
  private readonly roomManager: RoomManager;
  readonly peers: PeerManager;
  private dataHandlers: IncomingDataHandler[] = [];
  private peerJoinHandlers: PeerEventHandler[] = [];
  private peerLeaveHandlers: PeerLeaveHandler[] = [];

  constructor() {
    this.roomManager = new RoomManager({ appId: APP_ID });
    this.peers = new PeerManager();
  }

  /**
   * Joins a discovery room. Wires peer join/leave into PeerManager.
   * All incoming data is forwarded to registered handlers.
   */
  async joinRoom(roomId: string): Promise<void> {
    if (this.roomManager.isInRoom(roomId)) return;

    const room = await this.roomManager.join(
      roomId,
      (peerId) => {
        this.peers.onPeerJoined(peerId, roomId);
        this.peerJoinHandlers.forEach((h) => h(peerId, roomId));
      },
      (peerId) => {
        this.peers.onPeerLeft(peerId, roomId);
        this.peerLeaveHandlers.forEach((h) => h(peerId));
      },
    );

    room.onData((data, peerId) => {
      logger.debug('Data received', { roomId, peerId });
      this.dataHandlers.forEach((h) => h(data, peerId, roomId));
    });

    logger.info('Joined discovery room', { roomId });
  }

  async leaveRoom(roomId: string): Promise<void> {
    await this.roomManager.leave(roomId);
    logger.info('Left discovery room', { roomId });
  }

  async leaveAll(): Promise<void> {
    await this.roomManager.leaveAll();
    this.peers.clear();
    logger.info('Left all discovery rooms');
  }

  /**
   * Sends data to a specific peer or broadcasts to all peers in a room.
   */
  send(roomId: string, data: JsonValue, targetPeerId?: string): void {
    const room = this.roomManager.getRoom(roomId);
    if (!room) {
      logger.warn('Cannot send — not in room', { roomId });
      return;
    }
    room.send(data, targetPeerId);
  }

  /** Registers a handler called when any peer joins any room. */
  onPeerJoin(handler: PeerEventHandler): () => void {
    this.peerJoinHandlers.push(handler);
    return () => { this.peerJoinHandlers = this.peerJoinHandlers.filter((h) => h !== handler); };
  }

  /** Registers a handler called when any peer leaves any room. */
  onPeerLeave(handler: PeerLeaveHandler): () => void {
    this.peerLeaveHandlers.push(handler);
    return () => { this.peerLeaveHandlers = this.peerLeaveHandlers.filter((h) => h !== handler); };
  }

  /**
   * Registers a handler for all incoming data across all joined rooms.
   */
  onData(handler: IncomingDataHandler): () => void {
    this.dataHandlers.push(handler);
    return () => {
      this.dataHandlers = this.dataHandlers.filter((h) => h !== handler);
    };
  }

  getRoomIds(): string[] {
    return this.roomManager.getRoomIds();
  }

  isInRoom(roomId: string): boolean {
    return this.roomManager.isInRoom(roomId);
  }

  getRoomsForPeer(peerId: string): string[] {
    return this.peers.getRoomsForPeer(peerId);
  }
}

/** Singleton transport instance shared across the app. */
export const discoveryTransport = new DiscoveryTransport();

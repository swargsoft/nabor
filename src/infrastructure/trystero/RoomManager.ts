import { joinTrysteroRoom, type TrysteroConfig, type TrysteroRoom, type PeerJoinHandler, type PeerLeaveHandler } from './TrysteroClient';
import { createLogger } from '@/utils/logger';

const logger = createLogger('RoomManager');

export class RoomManager {
  private readonly rooms = new Map<string, TrysteroRoom>();
  private readonly config: TrysteroConfig;

  constructor(config: TrysteroConfig) {
    this.config = config;
  }

  async join(
    roomId: string,
    onPeerJoin?: PeerJoinHandler,
    onPeerLeave?: PeerLeaveHandler,
  ): Promise<TrysteroRoom> {
    if (this.rooms.has(roomId)) {
      logger.info('Already in room', { roomId });
      return this.rooms.get(roomId)!;
    }
    const room = await joinTrysteroRoom(this.config, roomId, onPeerJoin, onPeerLeave);
    this.rooms.set(roomId, room);
    return room;
  }

  async leave(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    await room.leave();
    this.rooms.delete(roomId);
  }

  async leaveAll(): Promise<void> {
    await Promise.all([...this.rooms.keys()].map((id) => this.leave(id)));
  }

  getRoom(roomId: string): TrysteroRoom | undefined {
    return this.rooms.get(roomId);
  }

  getRoomIds(): string[] {
    return [...this.rooms.keys()];
  }

  isInRoom(roomId: string): boolean {
    return this.rooms.has(roomId);
  }
}

import { joinRoom, selfId } from '@trystero-p2p/torrent';
import type { Room, DataPayload, JsonValue } from '@trystero-p2p/core';
import { ConnectivityService } from '@/services/connectivity/ConnectivityService';
import { createLogger } from '@/utils/logger';

const logger = createLogger('TrysteroClient');

export interface TrysteroConfig {
  appId: string;
}

export type PeerJoinHandler = (peerId: string) => void;
export type PeerLeaveHandler = (peerId: string) => void;
export type DataHandler = (data: JsonValue, peerId: string) => void;

export interface TrysteroRoom {
  roomId: string;
  send: (data: JsonValue, targetPeerId?: string) => void;
  onData: (handler: DataHandler) => void;
  getPeerIds: () => string[];
  leave: () => Promise<void>;
}

/**
 * Joins a Trystero room via the WebTorrent strategy.
 * ICE servers (STUN + optional TURN) are loaded from ConnectivityService.
 */
export async function joinTrysteroRoom(
  config: TrysteroConfig,
  roomId: string,
  onPeerJoin?: PeerJoinHandler,
  onPeerLeave?: PeerLeaveHandler,
): Promise<TrysteroRoom> {
  logger.info('Joining room', { roomId });

  const iceServers = await ConnectivityService.getIceServers();
  const room: Room = joinRoom({ appId: config.appId, rtcConfig: { iceServers } }, roomId, {
    onJoinError: (details) => {
      logger.error('Peer join failed', { requestedRoomId: roomId, details });
    },
  });
  const action = room.makeAction<DataPayload>('data');

  room.onPeerJoin = (peerId: string) => {
    logger.info('Peer joined', { roomId, peerId });
    onPeerJoin?.(peerId);
  };

  room.onPeerLeave = (peerId: string) => {
    logger.info('Peer left', { roomId, peerId });
    onPeerLeave?.(peerId);
  };

  let dataHandler: DataHandler | null = null;

  action.onMessage = (data: DataPayload, context: { peerId: string }) => {
    if (dataHandler) dataHandler(data as JsonValue, context.peerId);
  };

  return {
    roomId,
    send: (data: JsonValue, targetPeerId?: string) => {
      const opts = targetPeerId ? { target: targetPeerId as string } : undefined;
      action.send(data as DataPayload, opts as Parameters<typeof action.send>[1]);
    },
    onData: (handler: DataHandler) => {
      dataHandler = handler;
    },
    getPeerIds: () => Object.keys(room.getPeers()),
    leave: async () => {
      logger.info('Leaving room', { roomId });
      await room.leave();
    },
  };
}

/** The local peer's stable self ID assigned by Trystero. */
export { selfId };

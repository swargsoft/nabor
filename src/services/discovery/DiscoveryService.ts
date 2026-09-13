import { DiscoveryStrategyRegistry } from '@/infrastructure/discovery/DiscoveryStrategyRegistry';
import { LocationService } from '@/services/location/LocationService';
import { DiscoveryRepository } from '@/repositories/DiscoveryRepository';
import type { Discovery, DiscoveryStatus } from '@/types/db';
import { createLogger } from '@/utils/logger';

const logger = createLogger('DiscoveryService');

/** Prefix for all Nabor discovery room IDs. */
const ROOM_PREFIX = 'nabor:h3:';

export function h3ToRoomId(h3Index: string): string {
  return `${ROOM_PREFIX}${h3Index}`;
}

export interface DiscoveryContext {
  activeRooms: string[];
  peerCount: number;
}

export const DiscoveryService = {
  async startDiscovery(accountId: string): Promise<DiscoveryContext> {
    const ctx = await LocationService.getDiscoveryContext(accountId);
    if (!ctx) throw new Error('Location not set — call LocationService.updateLocation first');

    const cells = [ctx.h3Index, ...ctx.nearbyCells.filter((c) => c !== ctx.h3Index)];
    const roomIds = cells.map(h3ToRoomId);
    const strategy = DiscoveryStrategyRegistry.get();

    for (const roomId of roomIds) {
      await strategy.join(roomId);
    }

    logger.info('Discovery started', { accountId, rooms: roomIds.length });
    return { activeRooms: roomIds, peerCount: strategy.getPeerCount() };
  },

  async stopDiscovery(): Promise<void> {
    await DiscoveryStrategyRegistry.get().leaveAll();
    logger.info('Discovery stopped');
  },

  getContext(): DiscoveryContext {
    const strategy = DiscoveryStrategyRegistry.get();
    return { activeRooms: strategy.getRoomIds(), peerCount: strategy.getPeerCount() };
  },

  async recordSeen(peerId: string, h3Index: string): Promise<void> {
    await DiscoveryService._upsertDiscovery(peerId, h3Index, 'seen');
  },

  async recordLike(peerId: string, h3Index: string): Promise<void> {
    await DiscoveryService._upsertDiscovery(peerId, h3Index, 'liked');
    logger.info('Peer liked', { peerId });
  },

  async recordPass(peerId: string, h3Index: string): Promise<void> {
    await DiscoveryService._upsertDiscovery(peerId, h3Index, 'passed');
    logger.info('Peer passed', { peerId });
  },

  async getLikedPeers(): Promise<Discovery[]> {
    return DiscoveryRepository.getByStatus('liked');
  },

  async getPassedPeers(): Promise<Discovery[]> {
    return DiscoveryRepository.getByStatus('passed');
  },

  async getSeenPeers(): Promise<Discovery[]> {
    return DiscoveryRepository.getByStatus('seen');
  },

  /** A swipe is permanent for this local account/device until storage is cleared. */
  async isDismissed(peerId: string): Promise<boolean> {
    const entry = await DiscoveryRepository.get(peerId);
    return entry?.status === 'liked' || entry?.status === 'passed';
  },

  async getPeersInCell(h3Index: string): Promise<Discovery[]> {
    return DiscoveryRepository.getByH3Index(h3Index);
  },

  async hasSeenPeer(peerId: string): Promise<boolean> {
    const entry = await DiscoveryRepository.get(peerId);
    return entry !== undefined;
  },

  async _upsertDiscovery(peerId: string, h3Index: string, status: DiscoveryStatus): Promise<void> {
    const entry: Discovery = {
      id: peerId,
      peerId,
      h3Index,
      status,
      seenAt: Date.now(),
    };
    await DiscoveryRepository.save(entry);
  },
};

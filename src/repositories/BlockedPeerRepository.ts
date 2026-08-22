import { db } from './db/database';
import type { BlockedPeer } from '@/types/db';

export const BlockedPeerRepository = {
  async save(blocked: BlockedPeer): Promise<void> {
    await db.blockedPeers.put(blocked);
  },

  async get(peerId: string): Promise<BlockedPeer | undefined> {
    return db.blockedPeers.get(peerId);
  },

  async isBlocked(peerId: string): Promise<boolean> {
    return (await db.blockedPeers.get(peerId)) !== undefined;
  },

  async getAllForAccount(accountId: string): Promise<BlockedPeer[]> {
    return db.blockedPeers.where('accountId').equals(accountId).toArray();
  },

  async delete(peerId: string): Promise<void> {
    await db.blockedPeers.delete(peerId);
  },

  async clear(): Promise<void> {
    await db.blockedPeers.clear();
  },
};

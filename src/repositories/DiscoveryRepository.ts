import { db } from './db/database';
import type { Discovery, DiscoveryStatus } from '@/types/db';

export const DiscoveryRepository = {
  async save(discovery: Discovery): Promise<void> {
    await db.discovery.put(discovery);
  },

  async get(id: string): Promise<Discovery | undefined> {
    return db.discovery.get(id);
  },

  async getByH3Index(h3Index: string): Promise<Discovery[]> {
    return db.discovery.where('h3Index').equals(h3Index).toArray();
  },

  async getByStatus(status: DiscoveryStatus): Promise<Discovery[]> {
    return db.discovery.where('status').equals(status).toArray();
  },

  async delete(id: string): Promise<void> {
    await db.discovery.delete(id);
  },

  async clear(): Promise<void> {
    await db.discovery.clear();
  },
};

import { db } from './db/database';
import type { Identity } from '@/types/db';

export const IdentityRepository = {
  async save(identity: Identity): Promise<void> {
    await db.identities.put(identity);
  },

  async get(id: string): Promise<Identity | undefined> {
    return db.identities.get(id);
  },

  async getFirst(): Promise<Identity | undefined> {
    return db.identities.toCollection().first();
  },

  async delete(id: string): Promise<void> {
    await db.identities.delete(id);
  },

  async clear(): Promise<void> {
    await db.identities.clear();
  },
};

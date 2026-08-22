import { db } from './db/database';
import type { Location } from '@/types/db';

export const LocationRepository = {
  async save(location: Location): Promise<void> {
    await db.locations.put(location);
  },

  async get(id: string): Promise<Location | undefined> {
    return db.locations.get(id);
  },

  async delete(id: string): Promise<void> {
    await db.locations.delete(id);
  },

  async clear(): Promise<void> {
    await db.locations.clear();
  },
};

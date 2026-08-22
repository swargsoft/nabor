import { db } from './db/database';
import type { Profile } from '@/types/db';

export const ProfileRepository = {
  async save(profile: Profile): Promise<void> {
    await db.profiles.put(profile);
  },

  async get(id: string): Promise<Profile | undefined> {
    return db.profiles.get(id);
  },

  async delete(id: string): Promise<void> {
    await db.profiles.delete(id);
  },

  async clear(): Promise<void> {
    await db.profiles.clear();
  },
};

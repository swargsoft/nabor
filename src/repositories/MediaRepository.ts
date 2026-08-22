import { db } from './db/database';
import type { Media } from '@/types/db';

export const MediaRepository = {
  async save(media: Media): Promise<void> {
    await db.media.put(media);
  },

  async get(id: string): Promise<Media | undefined> {
    return db.media.get(id);
  },

  async getByOwner(ownerId: string): Promise<Media[]> {
    return db.media.where('ownerId').equals(ownerId).toArray();
  },

  async getByHash(hash: string): Promise<Media | undefined> {
    return db.media.where('hash').equals(hash).first();
  },

  async delete(id: string): Promise<void> {
    await db.media.delete(id);
  },

  async clear(): Promise<void> {
    await db.media.clear();
  },
};

import { db } from './db/database';
import type { Match, MatchStatus } from '@/types/db';

export const MatchRepository = {
  async save(match: Match): Promise<void> {
    await db.matches.put(match);
  },

  async get(id: string): Promise<Match | undefined> {
    return db.matches.get(id);
  },

  async getAllForAccount(accountId: string): Promise<Match[]> {
    return db.matches.where('accountId').equals(accountId).toArray();
  },

  async getByStatus(accountId: string, status: MatchStatus): Promise<Match[]> {
    return db.matches
      .where('accountId').equals(accountId)
      .and((m) => m.status === status)
      .toArray();
  },

  async delete(id: string): Promise<void> {
    await db.matches.delete(id);
  },

  async clear(): Promise<void> {
    await db.matches.clear();
  },
};

import { db } from './db/database';
import type { Conversation } from '@/types/db';

export const ConversationRepository = {
  async save(conversation: Conversation): Promise<void> {
    await db.conversations.put(conversation);
  },

  async get(id: string): Promise<Conversation | undefined> {
    return db.conversations.get(id);
  },

  async getAll(): Promise<Conversation[]> {
    return db.conversations.orderBy('lastMessageAt').reverse().toArray();
  },

  async getByMatchId(matchId: string): Promise<Conversation | undefined> {
    return db.conversations.where('matchId').equals(matchId).first();
  },

  async delete(id: string): Promise<void> {
    await db.conversations.delete(id);
  },

  async clear(): Promise<void> {
    await db.conversations.clear();
  },
};

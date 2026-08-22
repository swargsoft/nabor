import { db } from './db/database';
import type { Message } from '@/types/db';

export const MessageRepository = {
  async save(message: Message): Promise<void> {
    await db.messages.put(message);
  },

  async get(id: string): Promise<Message | undefined> {
    return db.messages.get(id);
  },

  async getForConversation(conversationId: string): Promise<Message[]> {
    return db.messages
      .where('conversationId').equals(conversationId)
      .sortBy('createdAt');
  },

  async getByStatus(status: string): Promise<Message[]> {
    return db.messages.where('status').equals(status).toArray();
  },

  async delete(id: string): Promise<void> {
    await db.messages.delete(id);
  },

  async deleteForConversation(conversationId: string): Promise<void> {
    const ids = await db.messages
      .where('conversationId').equals(conversationId)
      .primaryKeys();
    await db.messages.bulkDelete(ids);
  },

  async clear(): Promise<void> {
    await db.messages.clear();
  },
};

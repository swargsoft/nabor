import Dexie, { type Table } from 'dexie';
import type {
  Identity,
  Device,
  Profile,
  Match,
  Conversation,
  Message,
  Media,
  Location,
  Discovery,
  Settings,
  BlockedPeer,
} from '@/types/db';

export class NaborDB extends Dexie {
  identities!: Table<Identity, string>;
  devices!: Table<Device, string>;
  profiles!: Table<Profile, string>;
  matches!: Table<Match, string>;
  conversations!: Table<Conversation, string>;
  messages!: Table<Message, string>;
  media!: Table<Media, string>;
  locations!: Table<Location, string>;
  discovery!: Table<Discovery, string>;
  blockedPeers!: Table<BlockedPeer, string>;

  constructor() {
    super('nabor');

    // Version 1 — initial schema
    this.version(1).stores({
      identities:    'id, createdAt',
      devices:       'id, accountId, lastSeenAt',
      profiles:      'id, updatedAt',
      matches:       'id, accountId, peerId, status, updatedAt',
      conversations: 'id, matchId, peerId, lastMessageAt',
      messages:      'id, conversationId, senderId, createdAt',
      media:         'id, ownerId, hash, createdAt',
      locations:     'id, h3Index, updatedAt',
      discovery:     'id, peerId, h3Index, status, seenAt',
      settings:      'id',
    });

    // Version 2 — add blockedPeers table
    this.version(2).stores({
      blockedPeers: 'id, accountId, blockedAt',
    });

    // Version 3 — add status index to messages
    this.version(3).stores({
      messages: 'id, conversationId, senderId, status, createdAt',
    });
  }
}

export const db = new NaborDB();

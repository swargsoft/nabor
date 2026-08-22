import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { db } from '@/repositories/db/database';
import { MessageRepository } from '@/repositories/MessageRepository';
import { ProfileRepository } from '@/repositories/ProfileRepository';
import { MediaRepository } from '@/repositories/MediaRepository';
import type { Message, Profile, Media } from '@/types/db';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMessages(count: number, conversationId = 'conv-perf'): Message[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `msg-${conversationId}-${i}`,
    conversationId,
    senderId: i % 2 === 0 ? 'acc-local' : 'acc-peer',
    text: `Message number ${i}`,
    status: 'sent' as const,
    createdAt: i,
  }));
}

function makeProfiles(count: number): Profile[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `peer-${i}`,
    displayName: `User ${i}`,
    age: 20 + (i % 30),
    bio: `Bio for user ${i}`,
    gender: 'other' as const,
    interests: ['hiking', 'music'],
    photoIds: [`photo-${i}-a`, `photo-${i}-b`],
    locationEnabled: true,
    updatedAt: i,
  }));
}

function makeMediaRecords(count: number): Media[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `media-${i}`,
    ownerId: `peer-${i % 100}`,
    hash: `hash-${i}`,
    mimeType: 'image/jpeg',
    size: 50_000 + i,
    width: 800,
    height: 600,
    cacheKey: `nabor-media-v1/media-${i}`,
    createdAt: i,
    lastAccessedAt: i,
  }));
}

function elapsed(start: number): number {
  return performance.now() - start;
}

// ─── Messages: 10,000 records ─────────────────────────────────────────────────
// Seed once for the whole describe; each test uses a unique conversationId to isolate queries.

describe('Performance: 10,000 messages', () => {
  const COUNT = 10_000;

  beforeAll(async () => {
    await db.messages.clear();
    await db.messages.bulkPut(makeMessages(COUNT, 'conv-a'));
    await db.messages.bulkPut(makeMessages(COUNT, 'conv-b'));
  }, 30_000);

  afterAll(async () => { await db.messages.clear(); }, 30_000);

  it('getForConversation on 10k messages under 500ms', async () => {
    const t = performance.now();
    const result = await MessageRepository.getForConversation('conv-a');
    expect(elapsed(t)).toBeLessThan(500);
    expect(result).toHaveLength(COUNT);
  });

  it('getForConversation returns messages sorted by createdAt asc', async () => {
    const result = await MessageRepository.getForConversation('conv-a');
    expect(result[0].createdAt).toBeLessThanOrEqual(result[result.length - 1].createdAt);
  });

  it('getByStatus on 20k messages under 1s', async () => {
    const t = performance.now();
    const result = await MessageRepository.getByStatus('sent');
    expect(elapsed(t)).toBeLessThan(1000);
    expect(result.length).toBeGreaterThanOrEqual(COUNT);
  });

  it('single message get by id under 50ms', async () => {
    const t = performance.now();
    const msg = await MessageRepository.get(`msg-conv-a-5000`);
    expect(elapsed(t)).toBeLessThan(50);
    expect(msg?.id).toBe('msg-conv-a-5000');
  });

  it('deleteForConversation removes all messages for that conversation', async () => {
    await db.messages.bulkPut(makeMessages(100, 'conv-delete'));
    await MessageRepository.deleteForConversation('conv-delete');
    const remaining = await MessageRepository.getForConversation('conv-delete');
    expect(remaining).toHaveLength(0);
  }, 30_000);
});

// ─── Profiles: 1,000 records ──────────────────────────────────────────────────

describe('Performance: 1,000 cached profiles', () => {
  const COUNT = 1_000;

  beforeAll(async () => {
    await db.profiles.clear();
    await db.profiles.bulkPut(makeProfiles(COUNT));
  }, 10_000);

  afterAll(async () => { await db.profiles.clear(); });

  it('bulk insert 1k profiles under 2s', async () => {
    await db.profiles.clear();
    const t = performance.now();
    await db.profiles.bulkPut(makeProfiles(COUNT));
    expect(elapsed(t)).toBeLessThan(2000);
    expect(await db.profiles.count()).toBe(COUNT);
  }, 10_000);

  it('single profile get by id under 200ms', async () => {
    const t = performance.now();
    const profile = await ProfileRepository.get('peer-500');
    expect(elapsed(t)).toBeLessThan(200);
    expect(profile?.id).toBe('peer-500');
  });

  it('parallel get of 100 profiles under 1s', async () => {
    const t = performance.now();
    await Promise.all(
      Array.from({ length: 100 }, (_, i) => ProfileRepository.get(`peer-${i}`)),
    );
    expect(elapsed(t)).toBeLessThan(1000);
  });

  it('bulk update 100 profiles under 1s', async () => {
    const updates = makeProfiles(100).map((p) => ({ ...p, displayName: 'Updated' }));
    const t = performance.now();
    await db.profiles.bulkPut(updates);
    expect(elapsed(t)).toBeLessThan(1000);
  });
});

// ─── Media metadata: 1,000 records ───────────────────────────────────────────

describe('Performance: 1,000 media metadata records', () => {
  const COUNT = 1_000;

  beforeAll(async () => {
    await db.media.clear();
    await db.media.bulkPut(makeMediaRecords(COUNT));
  }, 10_000);

  afterAll(async () => { await db.media.clear(); });

  it('bulk insert 1k media records under 2s', async () => {
    await db.media.clear();
    const t = performance.now();
    await db.media.bulkPut(makeMediaRecords(COUNT));
    expect(elapsed(t)).toBeLessThan(2000);
    expect(await db.media.count()).toBe(COUNT);
  }, 10_000);

  it('getByOwner for 10 records under 500ms', async () => {
    // peer-0 owns indices 0,100,200,...,900 → 10 records
    const t = performance.now();
    const result = await MediaRepository.getByOwner('peer-0');
    expect(elapsed(t)).toBeLessThan(500);
    expect(result.length).toBeGreaterThanOrEqual(10);
  });

  it('getByHash under 200ms', async () => {
    const t = performance.now();
    const result = await MediaRepository.getByHash('hash-500');
    expect(elapsed(t)).toBeLessThan(200);
    expect(result?.id).toBe('media-500');
  });

  it('single media get by id under 200ms', async () => {
    const t = performance.now();
    const result = await MediaRepository.get('media-999');
    expect(elapsed(t)).toBeLessThan(200);
    expect(result?.id).toBe('media-999');
  });
});

// ─── P2P: session start time at varying peer counts ──────────────────────────

vi.mock('@/services/discovery/DiscoveryService', () => ({
  DiscoveryService: { startDiscovery: vi.fn(), stopDiscovery: vi.fn(), getContext: vi.fn() },
}));
vi.mock('@/services/messaging/HandshakeService', () => ({
  HandshakeService: { broadcastHello: vi.fn(), startListening: vi.fn(), clearRegistry: vi.fn() },
}));
vi.mock('@/services/profile/ProfileExchangeService', () => ({
  ProfileExchangeService: { startListening: vi.fn(), clearCache: vi.fn() },
}));
vi.mock('@/services/media/MediaExchangeService', () => ({
  MediaExchangeService: { startListening: vi.fn(), clearPending: vi.fn() },
}));
vi.mock('@/services/messaging/MessagingService', () => ({
  MessagingService: { onMessage: vi.fn(), onAck: vi.fn() },
}));
vi.mock('@/services/matching/MatchingService', () => ({
  MatchingService: { onLike: vi.fn(), onMatch: vi.fn() },
}));
vi.mock('@/services/messaging/MessageSyncService', () => ({
  MessageSyncService: { startListening: vi.fn() },
}));
vi.mock('@/infrastructure/trystero/DiscoveryTransport', () => ({
  discoveryTransport: {
    peers: { getPeer: vi.fn(() => undefined) },
    onPeerJoin: vi.fn(() => vi.fn()),
    onPeerLeave: vi.fn(() => vi.fn()),
  },
}));
vi.mock('@/services/connection/ConnectionService', () => ({
  ConnectionService: { onPeerConnected: vi.fn(), onPeerDisconnected: vi.fn(), clear: vi.fn() },
}));
vi.mock('@/services/safety/SafetyService', () => ({
  SafetyService: { clearMutes: vi.fn() },
}));
vi.mock('@/infrastructure/crypto/webcrypto', () => ({
  deriveKeyPairFromSeed: vi.fn(async () => ({
    privateKey: { type: 'private' } as CryptoKey,
    publicKey: { type: 'public' } as CryptoKey,
  })),
  exportPublicKey: vi.fn(async () => 'mock-pub'),
}));

import { SessionService } from '@/services/SessionService';
import { DiscoveryService } from '@/services/discovery/DiscoveryService';
import { HandshakeService } from '@/services/messaging/HandshakeService';
import { ProfileExchangeService } from '@/services/profile/ProfileExchangeService';
import { MediaExchangeService } from '@/services/media/MediaExchangeService';
import { MessagingService } from '@/services/messaging/MessagingService';
import { MatchingService } from '@/services/matching/MatchingService';
import { MessageSyncService } from '@/services/messaging/MessageSyncService';
import type { Identity, Device } from '@/types/db';

const IDENTITY: Identity = {
  id: 'acc-perf',
  publicKey: 'pub-perf',
  privateKey: btoa('a'.repeat(32)),
  createdAt: 0,
};
const DEVICE: Device = {
  id: 'dev-perf',
  accountId: 'acc-perf',
  publicKey: 'dev-pub-perf',
  name: 'Perf Device',
  createdAt: 0,
  lastSeenAt: 0,
};

function setupSessionMocks(roomCount: number, peerCount: number) {
  const rooms = Array.from({ length: roomCount }, (_, i) => `room-${i}`);
  vi.mocked(DiscoveryService.startDiscovery).mockResolvedValue({ activeRooms: rooms, peerCount });
  vi.mocked(HandshakeService.broadcastHello).mockResolvedValue(undefined);
  vi.mocked(HandshakeService.startListening).mockReturnValue(vi.fn());
  vi.mocked(ProfileExchangeService.startListening).mockReturnValue(vi.fn());
  vi.mocked(MediaExchangeService.startListening).mockReturnValue(vi.fn());
  vi.mocked(MessagingService.onMessage).mockReturnValue(vi.fn());
  vi.mocked(MessagingService.onAck).mockReturnValue(vi.fn());
  vi.mocked(MatchingService.onLike).mockReturnValue(vi.fn());
  vi.mocked(MatchingService.onMatch).mockReturnValue(vi.fn());
  vi.mocked(MessageSyncService.startListening).mockReturnValue(vi.fn());
}

describe('Performance: P2P session start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    SessionService._reset();
  });

  it.each([
    [2,   2,   500],
    [10,  10,  1000],
    [50,  50,  2000],
    [100, 100, 3000],
  ])('%i rooms / %i peers: session start under %ims', async (rooms, peers, budget) => {
    setupSessionMocks(rooms, peers);
    const t = performance.now();
    const state = await SessionService.start(IDENTITY, DEVICE);
    expect(elapsed(t)).toBeLessThan(budget);
    expect(state.peerCount).toBe(peers);
    expect(state.activeRooms).toHaveLength(rooms);
    await SessionService.stop();
  }, 10_000);

  it('HELLO broadcast scales linearly: 100 rooms all receive broadcast', async () => {
    setupSessionMocks(100, 100);
    await SessionService.start(IDENTITY, DEVICE);
    expect(vi.mocked(HandshakeService.broadcastHello)).toHaveBeenCalledTimes(100);
    await SessionService.stop();
  }, 10_000);
});

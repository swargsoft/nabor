import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/repositories/db/database';

// ─── Mock ProtocolService ─────────────────────────────────────────────────────

type MsgHandler = (incoming: { packet: unknown; peerId: string; roomId: string }) => void;
const _handlers = new Map<string, MsgHandler[]>();
const _sent: { roomId: string; type: string; payload: unknown; targetPeerId?: string }[] = [];

vi.mock('@/services/messaging/ProtocolService', () => ({
  ProtocolService: {
    send: vi.fn(async (roomId: string, type: string, payload: unknown, _sid: string, _pk: unknown, targetPeerId?: string) => {
      _sent.push({ roomId, type, payload, targetPeerId });
    }),
    onMessage: vi.fn((type: string, handler: MsgHandler) => {
      if (!_handlers.has(type)) _handlers.set(type, []);
      _handlers.get(type)!.push(handler);
      return () => {
        const arr = _handlers.get(type) ?? [];
        _handlers.set(type, arr.filter((h) => h !== handler));
      };
    }),
  },
}));

// ─── Mock DiscoveryService ────────────────────────────────────────────────────

vi.mock('@/services/discovery/DiscoveryService', () => ({
  DiscoveryService: {
    recordLike: vi.fn().mockResolvedValue(undefined),
    recordPass: vi.fn().mockResolvedValue(undefined),
  },
}));

import { MatchingService } from '@/services/matching/MatchingService';
import { MessageType } from '@/types/protocol';

const ACCOUNT_ID = 'acc-local';
const PEER_ID = 'acc-remote';
const ROOM_ID = 'nabor:h3:test-cell';
const H3 = 'test-cell';
const MOCK_KEY = {} as CryptoKey;

async function emitLike(fromId: string, targetId: string, peerId = fromId) {
  const promises = (_handlers.get(MessageType.LIKE) ?? []).map((h) =>
    Promise.resolve(h({ packet: { senderId: fromId, payload: { targetId } }, peerId, roomId: ROOM_ID })),
  );
  await Promise.all(promises);
}

beforeEach(async () => {
  await db.matches.clear();
  await db.conversations.clear();
  _sent.length = 0;
  _handlers.clear();
  vi.clearAllMocks();
});

// ─── sendLike ─────────────────────────────────────────────────────────────────

describe('MatchingService.sendLike', () => {
  it('sends a LIKE packet targeted at the peer', async () => {
    await MatchingService.sendLike(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, H3);
    const like = _sent.find((s) => s.type === MessageType.LIKE);
    expect(like).toBeDefined();
    expect(like!.targetPeerId).toBe(PEER_ID);
    expect((like!.payload as { targetId: string }).targetId).toBe(PEER_ID);
  });

  it('records the like in DiscoveryService', async () => {
    const { DiscoveryService } = await import('@/services/discovery/DiscoveryService');
    await MatchingService.sendLike(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, H3);
    expect(DiscoveryService.recordLike).toHaveBeenCalledWith(PEER_ID, H3);
  });

  it('saves a pending match record', async () => {
    await MatchingService.sendLike(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, H3);
    const match = await db.matches.get(`${ACCOUNT_ID}:${PEER_ID}`);
    expect(match?.status).toBe('pending');
  });

  it('returns null when no mutual like exists', async () => {
    const result = await MatchingService.sendLike(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, H3);
    expect(result).toBeNull();
  });

  it('returns MatchResult when peer already liked us', async () => {
    // Simulate peer's pending like already in DB
    await MatchingService._savePendingLike(PEER_ID, ACCOUNT_ID);
    const result = await MatchingService.sendLike(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, H3);
    expect(result).not.toBeNull();
    expect(result!.match.status).toBe('matched');
    expect(result!.conversation.peerId).toBe(PEER_ID);
  });
});

// ─── sendPass ─────────────────────────────────────────────────────────────────

describe('MatchingService.sendPass', () => {
  it('sends a PASS packet targeted at the peer', async () => {
    await MatchingService.sendPass(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, H3);
    const pass = _sent.find((s) => s.type === MessageType.PASS);
    expect(pass).toBeDefined();
    expect(pass!.targetPeerId).toBe(PEER_ID);
  });

  it('records the pass in DiscoveryService', async () => {
    const { DiscoveryService } = await import('@/services/discovery/DiscoveryService');
    await MatchingService.sendPass(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, H3);
    expect(DiscoveryService.recordPass).toHaveBeenCalledWith(PEER_ID, H3);
  });
});

// ─── handleIncomingLike ───────────────────────────────────────────────────────

describe('MatchingService.handleIncomingLike', () => {
  it('saves a pending like from the peer', async () => {
    await MatchingService.handleIncomingLike(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, H3);
    const match = await db.matches.get(`${PEER_ID}:${ACCOUNT_ID}`);
    expect(match?.status).toBe('pending');
  });

  it('returns null when we have not liked them yet', async () => {
    const result = await MatchingService.handleIncomingLike(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, H3);
    expect(result).toBeNull();
  });

  it('returns MatchResult when we already liked them', async () => {
    await MatchingService._savePendingLike(ACCOUNT_ID, PEER_ID);
    const result = await MatchingService.handleIncomingLike(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, H3);
    expect(result).not.toBeNull();
    expect(result!.match.status).toBe('matched');
  });

  it('creates a Conversation on mutual match', async () => {
    await MatchingService._savePendingLike(ACCOUNT_ID, PEER_ID);
    const result = await MatchingService.handleIncomingLike(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, H3);
    expect(result!.conversation.matchId).toBe(result!.match.id);
    expect(result!.conversation.peerId).toBe(PEER_ID);
  });

  it('sends a MATCH packet to the peer on mutual match', async () => {
    await MatchingService._savePendingLike(ACCOUNT_ID, PEER_ID);
    await MatchingService.handleIncomingLike(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, H3);
    const matchPkt = _sent.find((s) => s.type === MessageType.MATCH);
    expect(matchPkt).toBeDefined();
    expect(matchPkt!.targetPeerId).toBe(PEER_ID);
  });

  it('persists the matched Match record to DB', async () => {
    await MatchingService._savePendingLike(ACCOUNT_ID, PEER_ID);
    await MatchingService.handleIncomingLike(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, H3);
    const match = await db.matches.get(`${ACCOUNT_ID}:${PEER_ID}`);
    expect(match?.status).toBe('matched');
  });
});

// ─── onLike listener ──────────────────────────────────────────────────────────

describe('MatchingService.onLike', () => {
  it('calls onMatch callback on mutual like', async () => {
    await MatchingService._savePendingLike(ACCOUNT_ID, PEER_ID);
    const onMatch = vi.fn();
    MatchingService.onLike(ACCOUNT_ID, MOCK_KEY, H3, () => ROOM_ID, onMatch);
    await emitLike(PEER_ID, ACCOUNT_ID);
    expect(onMatch).toHaveBeenCalledOnce();
    expect(onMatch.mock.calls[0][0].match.status).toBe('matched');
  });

  it('ignores LIKE packets not targeting us', async () => {
    const onMatch = vi.fn();
    MatchingService.onLike(ACCOUNT_ID, MOCK_KEY, H3, () => ROOM_ID, onMatch);
    await emitLike(PEER_ID, 'someone-else');
    expect(onMatch).not.toHaveBeenCalled();
  });

  it('ignores LIKE when getRoomForPeer returns undefined', async () => {
    const onMatch = vi.fn();
    MatchingService.onLike(ACCOUNT_ID, MOCK_KEY, H3, () => undefined, onMatch);
    await emitLike(PEER_ID, ACCOUNT_ID);
    expect(onMatch).not.toHaveBeenCalled();
  });

  it('returns unsubscribe function', async () => {
    const onMatch = vi.fn();
    const unsub = MatchingService.onLike(ACCOUNT_ID, MOCK_KEY, H3, () => ROOM_ID, onMatch);
    unsub();
    await emitLike(PEER_ID, ACCOUNT_ID);
    expect(onMatch).not.toHaveBeenCalled();
  });
});

// ─── onMatch listener ─────────────────────────────────────────────────────────

describe('MatchingService.onMatch', () => {
  it('calls handler when a MATCH packet arrives', () => {
    const handler = vi.fn();
    MatchingService.onMatch(handler);
    (_handlers.get(MessageType.MATCH) ?? []).forEach((h) =>
      h({ packet: { senderId: PEER_ID, payload: { targetId: ACCOUNT_ID, conversationId: 'conv-1' } }, peerId: PEER_ID, roomId: ROOM_ID }),
    );
    expect(handler).toHaveBeenCalledWith({ targetId: ACCOUNT_ID, conversationId: 'conv-1' }, PEER_ID);
  });
});

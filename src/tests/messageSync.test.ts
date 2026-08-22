import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/repositories/db/database';
import type { MessageSyncRequestPayload, MessageSyncResponsePayload } from '@/types/protocol';

// ─── Mock ProtocolService ─────────────────────────────────────────────────────

type MsgHandler = (incoming: { packet: { payload: unknown; senderId: string }; peerId: string; roomId: string }) => void;
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

import { MessageSyncService } from '@/services/messaging/MessageSyncService';
import { MessageType } from '@/types/protocol';

const ACCOUNT_ID = 'acc-local';
const PEER_ID = 'acc-remote';
const ROOM_ID = 'nabor:h3:test-cell';
const CONV_ID = 'conv-sync-1';
const MOCK_KEY = {} as CryptoKey;

async function emitSyncRequest(payload: MessageSyncRequestPayload, peerId = PEER_ID) {
  const promises = (_handlers.get(MessageType.MESSAGE_SYNC_REQUEST) ?? []).map((h) =>
    Promise.resolve(h({ packet: { payload, senderId: peerId }, peerId, roomId: ROOM_ID })),
  );
  await Promise.all(promises);
}

async function emitSyncResponse(payload: MessageSyncResponsePayload) {
  const promises = (_handlers.get(MessageType.MESSAGE_SYNC_RESPONSE) ?? []).map((h) =>
    Promise.resolve(h({ packet: { payload, senderId: PEER_ID }, peerId: PEER_ID, roomId: ROOM_ID })),
  );
  await Promise.all(promises);
}

beforeEach(async () => {
  await db.messages.clear();
  await db.conversations.clear();
  _sent.length = 0;
  _handlers.clear();
  vi.clearAllMocks();
});

// ─── requestSync ──────────────────────────────────────────────────────────────

describe('MessageSyncService.requestSync', () => {
  it('sends a MESSAGE_SYNC_REQUEST to the target peer', async () => {
    await MessageSyncService.requestSync(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, CONV_ID);
    const pkt = _sent.find((s) => s.type === MessageType.MESSAGE_SYNC_REQUEST);
    expect(pkt).toBeDefined();
    expect(pkt!.targetPeerId).toBe(PEER_ID);
    expect((pkt!.payload as MessageSyncRequestPayload).conversationId).toBe(CONV_ID);
  });

  it('includes known message IDs from local DB', async () => {
    await db.messages.put({ id: 'msg-1', conversationId: CONV_ID, senderId: ACCOUNT_ID, text: 'Hi', status: 'sent', createdAt: 100 });
    await db.messages.put({ id: 'msg-2', conversationId: CONV_ID, senderId: PEER_ID, text: 'Hey', status: 'delivered', createdAt: 200 });

    await MessageSyncService.requestSync(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, CONV_ID);
    const pkt = _sent.find((s) => s.type === MessageType.MESSAGE_SYNC_REQUEST);
    const payload = pkt!.payload as MessageSyncRequestPayload;
    expect(payload.knownMessageIds).toContain('msg-1');
    expect(payload.knownMessageIds).toContain('msg-2');
  });

  it('sends empty knownMessageIds when conversation has no messages', async () => {
    await MessageSyncService.requestSync(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, CONV_ID);
    const pkt = _sent.find((s) => s.type === MessageType.MESSAGE_SYNC_REQUEST);
    expect((pkt!.payload as MessageSyncRequestPayload).knownMessageIds).toHaveLength(0);
  });
});

// ─── handleSyncRequest ────────────────────────────────────────────────────────

describe('MessageSyncService.handleSyncRequest', () => {
  it('responds with messages the requester does not have', async () => {
    await db.messages.put({ id: 'msg-a', conversationId: CONV_ID, senderId: ACCOUNT_ID, text: 'A', status: 'sent', createdAt: 100 });
    await db.messages.put({ id: 'msg-b', conversationId: CONV_ID, senderId: ACCOUNT_ID, text: 'B', status: 'sent', createdAt: 200 });

    const payload: MessageSyncRequestPayload = { conversationId: CONV_ID, knownMessageIds: ['msg-a'] };
    await MessageSyncService.handleSyncRequest(ROOM_ID, ACCOUNT_ID, MOCK_KEY, payload, PEER_ID);

    const pkt = _sent.find((s) => s.type === MessageType.MESSAGE_SYNC_RESPONSE);
    expect(pkt).toBeDefined();
    expect(pkt!.targetPeerId).toBe(PEER_ID);
    const resp = pkt!.payload as MessageSyncResponsePayload;
    expect(resp.conversationId).toBe(CONV_ID);
    expect(resp.messages).toHaveLength(1);
    expect(resp.messages[0].messageId).toBe('msg-b');
    expect(resp.messages[0].text).toBe('B');
  });

  it('sends empty messages array when requester has everything', async () => {
    await db.messages.put({ id: 'msg-x', conversationId: CONV_ID, senderId: ACCOUNT_ID, text: 'X', status: 'sent', createdAt: 100 });

    const payload: MessageSyncRequestPayload = { conversationId: CONV_ID, knownMessageIds: ['msg-x'] };
    await MessageSyncService.handleSyncRequest(ROOM_ID, ACCOUNT_ID, MOCK_KEY, payload, PEER_ID);

    const pkt = _sent.find((s) => s.type === MessageType.MESSAGE_SYNC_RESPONSE);
    expect((pkt!.payload as MessageSyncResponsePayload).messages).toHaveLength(0);
  });

  it('sends all messages when requester has none', async () => {
    await db.messages.put({ id: 'msg-1', conversationId: CONV_ID, senderId: ACCOUNT_ID, text: '1', status: 'sent', createdAt: 100 });
    await db.messages.put({ id: 'msg-2', conversationId: CONV_ID, senderId: ACCOUNT_ID, text: '2', status: 'sent', createdAt: 200 });

    const payload: MessageSyncRequestPayload = { conversationId: CONV_ID, knownMessageIds: [] };
    await MessageSyncService.handleSyncRequest(ROOM_ID, ACCOUNT_ID, MOCK_KEY, payload, PEER_ID);

    const pkt = _sent.find((s) => s.type === MessageType.MESSAGE_SYNC_RESPONSE);
    expect((pkt!.payload as MessageSyncResponsePayload).messages).toHaveLength(2);
  });

  it('does not include messages from other conversations', async () => {
    await db.messages.put({ id: 'msg-mine', conversationId: CONV_ID, senderId: ACCOUNT_ID, text: 'Mine', status: 'sent', createdAt: 100 });
    await db.messages.put({ id: 'msg-other', conversationId: 'other-conv', senderId: ACCOUNT_ID, text: 'Other', status: 'sent', createdAt: 100 });

    const payload: MessageSyncRequestPayload = { conversationId: CONV_ID, knownMessageIds: [] };
    await MessageSyncService.handleSyncRequest(ROOM_ID, ACCOUNT_ID, MOCK_KEY, payload, PEER_ID);

    const pkt = _sent.find((s) => s.type === MessageType.MESSAGE_SYNC_RESPONSE);
    const resp = pkt!.payload as MessageSyncResponsePayload;
    expect(resp.messages.every((m) => m.messageId !== 'msg-other')).toBe(true);
  });
});

// ─── handleSyncResponse ───────────────────────────────────────────────────────

describe('MessageSyncService.handleSyncResponse', () => {
  it('saves missing messages to DB', async () => {
    const payload: MessageSyncResponsePayload = {
      conversationId: CONV_ID,
      messages: [
        { messageId: 'sync-1', senderId: PEER_ID, text: 'Hello', createdAt: 100 },
        { messageId: 'sync-2', senderId: PEER_ID, text: 'World', createdAt: 200 },
      ],
    };

    const saved = await MessageSyncService.handleSyncResponse(payload);
    expect(saved).toBe(2);

    const m1 = await db.messages.get('sync-1');
    const m2 = await db.messages.get('sync-2');
    expect(m1?.text).toBe('Hello');
    expect(m2?.text).toBe('World');
    expect(m1?.status).toBe('delivered');
  });

  it('deduplicates — does not overwrite existing messages', async () => {
    await db.messages.put({ id: 'sync-1', conversationId: CONV_ID, senderId: PEER_ID, text: 'Original', status: 'read', createdAt: 100 });

    const payload: MessageSyncResponsePayload = {
      conversationId: CONV_ID,
      messages: [{ messageId: 'sync-1', senderId: PEER_ID, text: 'Overwrite attempt', createdAt: 100 }],
    };

    const saved = await MessageSyncService.handleSyncResponse(payload);
    expect(saved).toBe(0);

    const msg = await db.messages.get('sync-1');
    expect(msg?.text).toBe('Original');
    expect(msg?.status).toBe('read');
  });

  it('returns 0 when all messages are already known', async () => {
    await db.messages.put({ id: 'known-1', conversationId: CONV_ID, senderId: PEER_ID, text: 'Known', status: 'delivered', createdAt: 100 });

    const payload: MessageSyncResponsePayload = {
      conversationId: CONV_ID,
      messages: [{ messageId: 'known-1', senderId: PEER_ID, text: 'Known', createdAt: 100 }],
    };

    expect(await MessageSyncService.handleSyncResponse(payload)).toBe(0);
  });

  it('updates conversation lastMessageAt to the latest synced message', async () => {
    await db.conversations.put({ id: CONV_ID, matchId: 'match-1', peerId: PEER_ID, lastMessageAt: 50, createdAt: 0 });

    const payload: MessageSyncResponsePayload = {
      conversationId: CONV_ID,
      messages: [
        { messageId: 'new-1', senderId: PEER_ID, text: 'A', createdAt: 300 },
        { messageId: 'new-2', senderId: PEER_ID, text: 'B', createdAt: 500 },
      ],
    };

    await MessageSyncService.handleSyncResponse(payload);
    const conv = await db.conversations.get(CONV_ID);
    expect(conv!.lastMessageAt).toBe(500);
  });

  it('does not regress conversation lastMessageAt', async () => {
    await db.conversations.put({ id: CONV_ID, matchId: 'match-1', peerId: PEER_ID, lastMessageAt: 1000, createdAt: 0 });

    const payload: MessageSyncResponsePayload = {
      conversationId: CONV_ID,
      messages: [{ messageId: 'old-1', senderId: PEER_ID, text: 'Old', createdAt: 100 }],
    };

    await MessageSyncService.handleSyncResponse(payload);
    const conv = await db.conversations.get(CONV_ID);
    expect(conv!.lastMessageAt).toBe(1000);
  });

  it('returns 0 and does nothing for empty messages array', async () => {
    const payload: MessageSyncResponsePayload = { conversationId: CONV_ID, messages: [] };
    expect(await MessageSyncService.handleSyncResponse(payload)).toBe(0);
  });
});

// ─── startListening ───────────────────────────────────────────────────────────

describe('MessageSyncService.startListening', () => {
  it('wires MESSAGE_SYNC_REQUEST handler', async () => {
    await db.messages.put({ id: 'msg-z', conversationId: CONV_ID, senderId: ACCOUNT_ID, text: 'Z', status: 'sent', createdAt: 100 });

    MessageSyncService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID);

    await emitSyncRequest({ conversationId: CONV_ID, knownMessageIds: [] });

    const pkt = _sent.find((s) => s.type === MessageType.MESSAGE_SYNC_RESPONSE);
    expect(pkt).toBeDefined();
    expect((pkt!.payload as MessageSyncResponsePayload).messages[0].messageId).toBe('msg-z');
  });

  it('wires MESSAGE_SYNC_RESPONSE handler and saves new messages', async () => {
    MessageSyncService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID);

    await emitSyncResponse({
      conversationId: CONV_ID,
      messages: [{ messageId: 'incoming-1', senderId: PEER_ID, text: 'Synced!', createdAt: 999 }],
    });

    const saved = await db.messages.get('incoming-1');
    expect(saved?.text).toBe('Synced!');
  });

  it('skips sync request when getRoomForPeer returns undefined', async () => {
    MessageSyncService.startListening(ACCOUNT_ID, MOCK_KEY, () => undefined);
    await emitSyncRequest({ conversationId: CONV_ID, knownMessageIds: [] });
    expect(_sent).toHaveLength(0);
  });

  it('returns unsubscribe function that stops both handlers', async () => {
    const unsub = MessageSyncService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID);
    unsub();

    await emitSyncRequest({ conversationId: CONV_ID, knownMessageIds: [] });
    await emitSyncResponse({ conversationId: CONV_ID, messages: [{ messageId: 'x', senderId: PEER_ID, text: 'X', createdAt: 1 }] });

    expect(_sent).toHaveLength(0);
    expect(await db.messages.get('x')).toBeUndefined();
  });
});

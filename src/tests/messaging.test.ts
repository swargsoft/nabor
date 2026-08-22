import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/repositories/db/database';
import type { MessageAckPayload, MessagePayload } from '@/types/protocol';

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

import { MessagingService } from '@/services/messaging/MessagingService';
import { MessageType } from '@/types/protocol';

const ACCOUNT_ID = 'acc-local';
const PEER_ID = 'acc-remote';
const ROOM_ID = 'nabor:h3:test-cell';
const CONV_ID = 'conv-1';
const MOCK_KEY = {} as CryptoKey;

async function emitMessage(payload: MessagePayload, peerId = PEER_ID) {
  const promises = (_handlers.get(MessageType.MESSAGE) ?? []).map((h) =>
    Promise.resolve(h({ packet: { payload, senderId: peerId }, peerId, roomId: ROOM_ID })),
  );
  await Promise.all(promises);
}

async function emitAck(payload: MessageAckPayload) {
  const promises = (_handlers.get(MessageType.MESSAGE_ACK) ?? []).map((h) =>
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

// ─── sendMessage ──────────────────────────────────────────────────────────────

describe('MessagingService.sendMessage', () => {
  it('persists the message with sent status', async () => {
    const msg = await MessagingService.sendMessage(ROOM_ID, ACCOUNT_ID, MOCK_KEY, CONV_ID, PEER_ID, 'Hello!');
    expect(msg.status).toBe('sent');
    expect(msg.text).toBe('Hello!');
    expect(msg.conversationId).toBe(CONV_ID);
    expect(msg.senderId).toBe(ACCOUNT_ID);
  });

  it('saves the message to DB', async () => {
    const msg = await MessagingService.sendMessage(ROOM_ID, ACCOUNT_ID, MOCK_KEY, CONV_ID, PEER_ID, 'Hi');
    const saved = await db.messages.get(msg.id);
    expect(saved?.status).toBe('sent');
  });

  it('sends a MESSAGE packet targeted at the peer', async () => {
    await MessagingService.sendMessage(ROOM_ID, ACCOUNT_ID, MOCK_KEY, CONV_ID, PEER_ID, 'Hi');
    const pkt = _sent.find((s) => s.type === MessageType.MESSAGE);
    expect(pkt).toBeDefined();
    expect(pkt!.targetPeerId).toBe(PEER_ID);
    expect((pkt!.payload as MessagePayload).text).toBe('Hi');
    expect((pkt!.payload as MessagePayload).conversationId).toBe(CONV_ID);
  });

  it('updates conversation lastMessageAt', async () => {
    await db.conversations.put({ id: CONV_ID, matchId: 'match-1', peerId: PEER_ID, lastMessageAt: 0, createdAt: 0 });
    await MessagingService.sendMessage(ROOM_ID, ACCOUNT_ID, MOCK_KEY, CONV_ID, PEER_ID, 'Hi');
    const conv = await db.conversations.get(CONV_ID);
    expect(conv!.lastMessageAt).toBeGreaterThan(0);
  });

  it('generates a unique messageId per message', async () => {
    const m1 = await MessagingService.sendMessage(ROOM_ID, ACCOUNT_ID, MOCK_KEY, CONV_ID, PEER_ID, 'A');
    const m2 = await MessagingService.sendMessage(ROOM_ID, ACCOUNT_ID, MOCK_KEY, CONV_ID, PEER_ID, 'B');
    expect(m1.id).not.toBe(m2.id);
  });
});

// ─── handleIncomingMessage ────────────────────────────────────────────────────

describe('MessagingService.handleIncomingMessage', () => {
  it('saves the incoming message with delivered status', async () => {
    const payload: MessagePayload = { conversationId: CONV_ID, messageId: 'msg-x', text: 'Hey' };
    const msg = await MessagingService.handleIncomingMessage(ROOM_ID, ACCOUNT_ID, MOCK_KEY, payload, PEER_ID);
    expect(msg.status).toBe('delivered');
    expect(msg.senderId).toBe(PEER_ID);
    expect(msg.text).toBe('Hey');
  });

  it('persists the message to DB', async () => {
    const payload: MessagePayload = { conversationId: CONV_ID, messageId: 'msg-y', text: 'Yo' };
    await MessagingService.handleIncomingMessage(ROOM_ID, ACCOUNT_ID, MOCK_KEY, payload, PEER_ID);
    const saved = await db.messages.get('msg-y');
    expect(saved).toBeDefined();
  });

  it('sends a delivered ACK back to the sender', async () => {
    const payload: MessagePayload = { conversationId: CONV_ID, messageId: 'msg-z', text: 'Ack me' };
    await MessagingService.handleIncomingMessage(ROOM_ID, ACCOUNT_ID, MOCK_KEY, payload, PEER_ID);
    const ack = _sent.find((s) => s.type === MessageType.MESSAGE_ACK);
    expect(ack).toBeDefined();
    expect(ack!.targetPeerId).toBe(PEER_ID);
    expect((ack!.payload as MessageAckPayload).status).toBe('delivered');
    expect((ack!.payload as MessageAckPayload).messageId).toBe('msg-z');
  });

  it('updates conversation lastMessageAt', async () => {
    await db.conversations.put({ id: CONV_ID, matchId: 'match-1', peerId: PEER_ID, lastMessageAt: 0, createdAt: 0 });
    const payload: MessagePayload = { conversationId: CONV_ID, messageId: 'msg-t', text: 'Touch' };
    await MessagingService.handleIncomingMessage(ROOM_ID, ACCOUNT_ID, MOCK_KEY, payload, PEER_ID);
    const conv = await db.conversations.get(CONV_ID);
    expect(conv!.lastMessageAt).toBeGreaterThan(0);
  });
});

// ─── markRead ─────────────────────────────────────────────────────────────────

describe('MessagingService.markRead', () => {
  it('updates message status to read', async () => {
    await db.messages.put({ id: 'msg-1', conversationId: CONV_ID, senderId: PEER_ID, text: 'Hi', status: 'delivered', createdAt: 0 });
    await MessagingService.markRead(ROOM_ID, ACCOUNT_ID, MOCK_KEY, 'msg-1', PEER_ID);
    const msg = await db.messages.get('msg-1');
    expect(msg?.status).toBe('read');
  });

  it('sends a read ACK to the sender', async () => {
    await db.messages.put({ id: 'msg-2', conversationId: CONV_ID, senderId: PEER_ID, text: 'Hi', status: 'delivered', createdAt: 0 });
    await MessagingService.markRead(ROOM_ID, ACCOUNT_ID, MOCK_KEY, 'msg-2', PEER_ID);
    const ack = _sent.find((s) => s.type === MessageType.MESSAGE_ACK);
    expect((ack!.payload as MessageAckPayload).status).toBe('read');
    expect(ack!.targetPeerId).toBe(PEER_ID);
  });

  it('is a no-op for unknown messageId', async () => {
    await MessagingService.markRead(ROOM_ID, ACCOUNT_ID, MOCK_KEY, 'nonexistent', PEER_ID);
    expect(_sent).toHaveLength(0);
  });
});

// ─── handleAck ────────────────────────────────────────────────────────────────

describe('MessagingService.handleAck', () => {
  it('advances status from sent to delivered', async () => {
    await db.messages.put({ id: 'msg-3', conversationId: CONV_ID, senderId: ACCOUNT_ID, text: 'Hi', status: 'sent', createdAt: 0 });
    await MessagingService.handleAck({ messageId: 'msg-3', status: 'delivered' });
    expect((await db.messages.get('msg-3'))?.status).toBe('delivered');
  });

  it('advances status from delivered to read', async () => {
    await db.messages.put({ id: 'msg-4', conversationId: CONV_ID, senderId: ACCOUNT_ID, text: 'Hi', status: 'delivered', createdAt: 0 });
    await MessagingService.handleAck({ messageId: 'msg-4', status: 'read' });
    expect((await db.messages.get('msg-4'))?.status).toBe('read');
  });

  it('does not regress status from read to delivered', async () => {
    await db.messages.put({ id: 'msg-5', conversationId: CONV_ID, senderId: ACCOUNT_ID, text: 'Hi', status: 'read', createdAt: 0 });
    await MessagingService.handleAck({ messageId: 'msg-5', status: 'delivered' });
    expect((await db.messages.get('msg-5'))?.status).toBe('read');
  });

  it('is a no-op for unknown messageId', async () => {
    await expect(MessagingService.handleAck({ messageId: 'ghost', status: 'read' })).resolves.toBeUndefined();
  });
});

// ─── onMessage listener ───────────────────────────────────────────────────────

describe('MessagingService.onMessage', () => {
  it('calls handler with the saved message', async () => {
    const handler = vi.fn();
    MessagingService.onMessage(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID, handler);
    await emitMessage({ conversationId: CONV_ID, messageId: 'msg-a', text: 'Live msg' });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].text).toBe('Live msg');
  });

  it('skips delivery when getRoomForPeer returns undefined', async () => {
    const handler = vi.fn();
    MessagingService.onMessage(ACCOUNT_ID, MOCK_KEY, () => undefined, handler);
    await emitMessage({ conversationId: CONV_ID, messageId: 'msg-b', text: 'No room' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns unsubscribe function', async () => {
    const handler = vi.fn();
    const unsub = MessagingService.onMessage(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID, handler);
    unsub();
    await emitMessage({ conversationId: CONV_ID, messageId: 'msg-c', text: 'After unsub' });
    expect(handler).not.toHaveBeenCalled();
  });
});

// ─── onAck listener ───────────────────────────────────────────────────────────

describe('MessagingService.onAck', () => {
  it('updates message status via handleAck', async () => {
    await db.messages.put({ id: 'msg-d', conversationId: CONV_ID, senderId: ACCOUNT_ID, text: 'Hi', status: 'sent', createdAt: 0 });
    MessagingService.onAck();
    await emitAck({ messageId: 'msg-d', status: 'delivered' });
    expect((await db.messages.get('msg-d'))?.status).toBe('delivered');
  });

  it('calls optional handler with the ack payload', async () => {
    await db.messages.put({ id: 'msg-e', conversationId: CONV_ID, senderId: ACCOUNT_ID, text: 'Hi', status: 'sent', createdAt: 0 });
    const handler = vi.fn();
    MessagingService.onAck(handler);
    await emitAck({ messageId: 'msg-e', status: 'read' });
    expect(handler).toHaveBeenCalledWith({ messageId: 'msg-e', status: 'read' });
  });
});

// ─── getMessages ──────────────────────────────────────────────────────────────

describe('MessagingService.getMessages', () => {
  it('returns messages for a conversation sorted by createdAt', async () => {
    await db.messages.put({ id: 'm1', conversationId: CONV_ID, senderId: ACCOUNT_ID, text: 'First', status: 'sent', createdAt: 100 });
    await db.messages.put({ id: 'm2', conversationId: CONV_ID, senderId: PEER_ID, text: 'Second', status: 'delivered', createdAt: 200 });
    await db.messages.put({ id: 'm3', conversationId: 'other-conv', senderId: PEER_ID, text: 'Other', status: 'delivered', createdAt: 50 });
    const msgs = await MessagingService.getMessages(CONV_ID);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].id).toBe('m1');
    expect(msgs[1].id).toBe('m2');
  });

  it('returns empty array for unknown conversationId', async () => {
    expect(await MessagingService.getMessages('no-conv')).toHaveLength(0);
  });
});

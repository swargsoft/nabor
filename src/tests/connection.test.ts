import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/repositories/db/database';

// ─── Mock MessageSyncService ──────────────────────────────────────────────────

vi.mock('@/services/messaging/MessageSyncService', () => ({
  MessageSyncService: {
    requestSync: vi.fn(async () => {}),
  },
}));

import { ConnectionService } from '@/services/connection/ConnectionService';
import { MessageSyncService } from '@/services/messaging/MessageSyncService';

const ACCOUNT_ID = 'acc-local';
const PEER_ID = 'acc-remote';
const ROOM_ID = 'nabor:h3:test-cell';
const MOCK_KEY = {} as CryptoKey;

beforeEach(async () => {
  await db.messages.clear();
  await db.conversations.clear();
  ConnectionService.clear();
  vi.clearAllMocks();
  vi.mocked(MessageSyncService.requestSync).mockResolvedValue(undefined);
});

// ─── onPeerConnected ──────────────────────────────────────────────────────────

describe('ConnectionService.onPeerConnected', () => {
  it('sets peer state to connected', () => {
    ConnectionService.onPeerConnected(PEER_ID, ROOM_ID, ACCOUNT_ID, MOCK_KEY);
    expect(ConnectionService.getState(PEER_ID)).toBe('connected');
  });

  it('emits connected state to handlers', () => {
    const handler = vi.fn();
    ConnectionService.onStateChange(handler);
    ConnectionService.onPeerConnected(PEER_ID, ROOM_ID, ACCOUNT_ID, MOCK_KEY);
    expect(handler).toHaveBeenCalledWith(PEER_ID, 'connected');
  });

  it('does not trigger sync on first connection (no prior state)', async () => {
    ConnectionService.onPeerConnected(PEER_ID, ROOM_ID, ACCOUNT_ID, MOCK_KEY);
    await Promise.resolve();
    expect(MessageSyncService.requestSync).not.toHaveBeenCalled();
  });

  it('triggers sync when peer reconnects after disconnect', async () => {
    await db.conversations.put({ id: 'conv-1', matchId: 'match-1', peerId: PEER_ID, lastMessageAt: 0, createdAt: 0 });

    // First connect then disconnect
    ConnectionService.onPeerConnected(PEER_ID, ROOM_ID, ACCOUNT_ID, MOCK_KEY);
    ConnectionService.onPeerDisconnected(PEER_ID);

    // Reconnect
    ConnectionService.onPeerConnected(PEER_ID, ROOM_ID, ACCOUNT_ID, MOCK_KEY);
    await new Promise((r) => setTimeout(r, 10)); // let async sync run

    expect(MessageSyncService.requestSync).toHaveBeenCalledWith(
      ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, 'conv-1',
    );
  });

  it('triggers sync for all conversations with the peer on reconnect', async () => {
    await db.conversations.put({ id: 'conv-a', matchId: 'm-a', peerId: PEER_ID, lastMessageAt: 0, createdAt: 0 });
    await db.conversations.put({ id: 'conv-b', matchId: 'm-b', peerId: PEER_ID, lastMessageAt: 0, createdAt: 0 });
    await db.conversations.put({ id: 'conv-c', matchId: 'm-c', peerId: 'other-peer', lastMessageAt: 0, createdAt: 0 });

    ConnectionService.onPeerConnected(PEER_ID, ROOM_ID, ACCOUNT_ID, MOCK_KEY);
    ConnectionService.onPeerDisconnected(PEER_ID);
    ConnectionService.onPeerConnected(PEER_ID, ROOM_ID, ACCOUNT_ID, MOCK_KEY);
    await new Promise((r) => setTimeout(r, 10));

    const calls = vi.mocked(MessageSyncService.requestSync).mock.calls;
    const syncedConvIds = calls.map((c) => c[4]);
    expect(syncedConvIds).toContain('conv-a');
    expect(syncedConvIds).toContain('conv-b');
    expect(syncedConvIds).not.toContain('conv-c');
  });

  it('advances stuck sending messages to sent on reconnect', async () => {
    await db.conversations.put({ id: 'conv-1', matchId: 'm-1', peerId: PEER_ID, lastMessageAt: 0, createdAt: 0 });
    await db.messages.put({ id: 'msg-stuck', conversationId: 'conv-1', senderId: ACCOUNT_ID, text: 'Hi', status: 'sending', createdAt: 100 });

    ConnectionService.onPeerConnected(PEER_ID, ROOM_ID, ACCOUNT_ID, MOCK_KEY);
    ConnectionService.onPeerDisconnected(PEER_ID);
    ConnectionService.onPeerConnected(PEER_ID, ROOM_ID, ACCOUNT_ID, MOCK_KEY);
    await new Promise((r) => setTimeout(r, 10));

    const msg = await db.messages.get('msg-stuck');
    expect(msg?.status).toBe('sent');
  });

  it('does not advance messages from other peers conversations', async () => {
    await db.conversations.put({ id: 'conv-other', matchId: 'm-o', peerId: 'other-peer', lastMessageAt: 0, createdAt: 0 });
    await db.messages.put({ id: 'msg-other', conversationId: 'conv-other', senderId: ACCOUNT_ID, text: 'Hi', status: 'sending', createdAt: 100 });

    ConnectionService.onPeerConnected(PEER_ID, ROOM_ID, ACCOUNT_ID, MOCK_KEY);
    ConnectionService.onPeerDisconnected(PEER_ID);
    ConnectionService.onPeerConnected(PEER_ID, ROOM_ID, ACCOUNT_ID, MOCK_KEY);
    await new Promise((r) => setTimeout(r, 10));

    const msg = await db.messages.get('msg-other');
    expect(msg?.status).toBe('sending'); // untouched
  });
});

// ─── onPeerDisconnected ───────────────────────────────────────────────────────

describe('ConnectionService.onPeerDisconnected', () => {
  it('sets peer state to reconnecting immediately', () => {
    ConnectionService.onPeerConnected(PEER_ID, ROOM_ID, ACCOUNT_ID, MOCK_KEY);
    ConnectionService.onPeerDisconnected(PEER_ID);
    expect(ConnectionService.getState(PEER_ID)).toBe('reconnecting');
  });

  it('emits reconnecting state to handlers', () => {
    const handler = vi.fn();
    ConnectionService.onStateChange(handler);
    ConnectionService.onPeerConnected(PEER_ID, ROOM_ID, ACCOUNT_ID, MOCK_KEY);
    ConnectionService.onPeerDisconnected(PEER_ID);
    expect(handler).toHaveBeenCalledWith(PEER_ID, 'reconnecting');
  });
});

// ─── getState ─────────────────────────────────────────────────────────────────

describe('ConnectionService.getState', () => {
  it('returns null for unknown peer', () => {
    expect(ConnectionService.getState('unknown')).toBeNull();
  });

  it('returns connected after onPeerConnected', () => {
    ConnectionService.onPeerConnected(PEER_ID, ROOM_ID, ACCOUNT_ID, MOCK_KEY);
    expect(ConnectionService.getState(PEER_ID)).toBe('connected');
  });

  it('returns reconnecting after onPeerDisconnected', () => {
    ConnectionService.onPeerConnected(PEER_ID, ROOM_ID, ACCOUNT_ID, MOCK_KEY);
    ConnectionService.onPeerDisconnected(PEER_ID);
    expect(ConnectionService.getState(PEER_ID)).toBe('reconnecting');
  });
});

// ─── onStateChange ────────────────────────────────────────────────────────────

describe('ConnectionService.onStateChange', () => {
  it('calls handler on connect and disconnect', () => {
    const handler = vi.fn();
    ConnectionService.onStateChange(handler);
    ConnectionService.onPeerConnected(PEER_ID, ROOM_ID, ACCOUNT_ID, MOCK_KEY);
    ConnectionService.onPeerDisconnected(PEER_ID);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, PEER_ID, 'connected');
    expect(handler).toHaveBeenNthCalledWith(2, PEER_ID, 'reconnecting');
  });

  it('returns unsubscribe function', () => {
    const handler = vi.fn();
    const unsub = ConnectionService.onStateChange(handler);
    unsub();
    ConnectionService.onPeerConnected(PEER_ID, ROOM_ID, ACCOUNT_ID, MOCK_KEY);
    expect(handler).not.toHaveBeenCalled();
  });
});

// ─── clear ────────────────────────────────────────────────────────────────────

describe('ConnectionService.clear', () => {
  it('removes all peer states', () => {
    ConnectionService.onPeerConnected(PEER_ID, ROOM_ID, ACCOUNT_ID, MOCK_KEY);
    ConnectionService.clear();
    expect(ConnectionService.getState(PEER_ID)).toBeNull();
  });

  it('removes all state change handlers', () => {
    const handler = vi.fn();
    ConnectionService.onStateChange(handler);
    ConnectionService.clear();
    ConnectionService.onPeerConnected(PEER_ID, ROOM_ID, ACCOUNT_ID, MOCK_KEY);
    expect(handler).not.toHaveBeenCalled();
  });
});

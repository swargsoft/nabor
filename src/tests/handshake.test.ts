import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock ProtocolService ─────────────────────────────────────────────────────

type MsgHandler = (incoming: { packet: unknown; peerId: string; roomId: string; verified: boolean }) => void;
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

import { HandshakeService } from '@/services/messaging/HandshakeService';
import { MessageType } from '@/types/protocol';

function emit(type: string, packet: unknown, peerId = 'peer-1', roomId = 'room-1') {
  (_handlers.get(type) ?? []).forEach((h) => h({ packet, peerId, roomId, verified: false }));
}

beforeEach(() => {
  _sent.length = 0;
  _handlers.clear();
  vi.clearAllMocks();
  HandshakeService.clearRegistry();
});

// ─── broadcastHello ───────────────────────────────────────────────────────────

describe('HandshakeService.broadcastHello', () => {
  it('sends a HELLO packet to the room', async () => {
    await HandshakeService.broadcastHello('room-1', 'acc-1', 'pubkey-b64', 'dev-1', {} as CryptoKey);
    expect(_sent).toHaveLength(1);
    expect(_sent[0].type).toBe(MessageType.HELLO);
    expect(_sent[0].roomId).toBe('room-1');
  });

  it('includes publicKey and deviceId in payload', async () => {
    await HandshakeService.broadcastHello('room-1', 'acc-1', 'pubkey-b64', 'dev-1', {} as CryptoKey);
    const payload = _sent[0].payload as { publicKey: string; deviceId: string };
    expect(payload.publicKey).toBe('pubkey-b64');
    expect(payload.deviceId).toBe('dev-1');
  });

  it('includes optional displayName when provided', async () => {
    await HandshakeService.broadcastHello('room-1', 'acc-1', 'pk', 'dev-1', {} as CryptoKey, 'Alice');
    const payload = _sent[0].payload as { displayName?: string };
    expect(payload.displayName).toBe('Alice');
  });

  it('does not set targetPeerId (broadcast)', async () => {
    await HandshakeService.broadcastHello('room-1', 'acc-1', 'pk', 'dev-1', {} as CryptoKey);
    expect(_sent[0].targetPeerId).toBeUndefined();
  });
});

// ─── sendPing ─────────────────────────────────────────────────────────────────

describe('HandshakeService.sendPing', () => {
  it('sends a PING packet targeted at a specific peer', async () => {
    await HandshakeService.sendPing('room-1', 'acc-1', {} as CryptoKey, 'peer-2', 'nonce-abc');
    expect(_sent[0].type).toBe(MessageType.PING);
    expect(_sent[0].targetPeerId).toBe('peer-2');
    expect((_sent[0].payload as { nonce: string }).nonce).toBe('nonce-abc');
  });
});

// ─── startListening — HELLO ───────────────────────────────────────────────────

describe('HandshakeService.startListening — HELLO', () => {
  it('registers peer public key on HELLO receipt', () => {
    HandshakeService.startListening('acc-1', {} as CryptoKey, () => 'room-1');
    emit(MessageType.HELLO, {
      senderId: 'peer-sender',
      payload: { publicKey: 'their-pubkey', deviceId: 'dev-x' },
    });
    expect(HandshakeService.getPeerPublicKey('peer-sender')).toBe('their-pubkey');
  });

  it('overwrites key if peer sends HELLO again', () => {
    HandshakeService.startListening('acc-1', {} as CryptoKey, () => 'room-1');
    emit(MessageType.HELLO, { senderId: 'peer-1', payload: { publicKey: 'key-v1', deviceId: 'd' } });
    emit(MessageType.HELLO, { senderId: 'peer-1', payload: { publicKey: 'key-v2', deviceId: 'd' } });
    expect(HandshakeService.getPeerPublicKey('peer-1')).toBe('key-v2');
  });
});

// ─── startListening — PING/PONG ───────────────────────────────────────────────

describe('HandshakeService.startListening — PING/PONG', () => {
  it('responds to PING with a PONG echoing the nonce', async () => {
    HandshakeService.startListening('acc-1', {} as CryptoKey, () => 'room-1');
    await emit(MessageType.PING, {
      senderId: 'peer-1',
      payload: { nonce: 'xyz-nonce' },
    }, 'peer-1', 'room-1');
    // Allow async handler to complete
    await Promise.resolve();
    const pong = _sent.find((s) => s.type === MessageType.PONG);
    expect(pong).toBeDefined();
    expect((pong!.payload as { nonce: string }).nonce).toBe('xyz-nonce');
    expect(pong!.targetPeerId).toBe('peer-1');
  });

  it('does not send PONG when getRoomForPeer returns undefined', async () => {
    HandshakeService.startListening('acc-1', {} as CryptoKey, () => undefined);
    await emit(MessageType.PING, { senderId: 'peer-1', payload: { nonce: 'n' } }, 'peer-1');
    await Promise.resolve();
    expect(_sent.filter((s) => s.type === MessageType.PONG)).toHaveLength(0);
  });
});

// ─── unsubscribe ──────────────────────────────────────────────────────────────

describe('HandshakeService.startListening — unsubscribe', () => {
  it('stops handling messages after unsubscribe', () => {
    const unsub = HandshakeService.startListening('acc-1', {} as CryptoKey, () => 'room-1');
    unsub();
    emit(MessageType.HELLO, { senderId: 'peer-1', payload: { publicKey: 'pk', deviceId: 'd' } });
    expect(HandshakeService.getPeerPublicKey('peer-1')).toBeNull();
  });
});

// ─── key registry ─────────────────────────────────────────────────────────────

describe('HandshakeService key registry', () => {
  it('getPeerPublicKey returns null for unknown peer', () => {
    expect(HandshakeService.getPeerPublicKey('unknown')).toBeNull();
  });

  it('registerPeerKey stores a key manually', () => {
    HandshakeService.registerPeerKey('peer-x', 'manual-key');
    expect(HandshakeService.getPeerPublicKey('peer-x')).toBe('manual-key');
  });

  it('clearRegistry removes all keys', () => {
    HandshakeService.registerPeerKey('peer-x', 'key');
    HandshakeService.clearRegistry();
    expect(HandshakeService.getPeerPublicKey('peer-x')).toBeNull();
  });
});

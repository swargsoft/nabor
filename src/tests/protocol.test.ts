import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateKeyPair, exportPublicKey, exportPrivateKey } from '@/infrastructure/crypto/webcrypto';
import { createPacket, verifyPacket, parsePacket } from '@/infrastructure/trystero/ProtocolCodec';
import { MessageType, PROTOCOL_VERSION } from '@/types/protocol';
import type { HelloPayload, PingPayload } from '@/types/protocol';

// ─── Mock DiscoveryTransport ──────────────────────────────────────────────────

type DataHandler = (data: unknown, peerId: string, roomId: string) => void;

const _sentPackets: { roomId: string; data: unknown; targetPeerId?: string }[] = [];
let _dataHandler: DataHandler | null = null;

vi.mock('@/infrastructure/trystero/DiscoveryTransport', () => ({
  discoveryTransport: {
    send: vi.fn((roomId: string, data: unknown, targetPeerId?: string) => {
      _sentPackets.push({ roomId, data, targetPeerId });
    }),
    onData: vi.fn((handler: DataHandler) => {
      _dataHandler = handler;
      return () => { _dataHandler = null; };
    }),
  },
}));

import { ProtocolService } from '@/services/messaging/ProtocolService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeIdentity() {
  const keyPair = await generateKeyPair();
  const publicKeyB64 = await exportPublicKey(keyPair.publicKey);
  return { keyPair, publicKeyB64, senderId: 'test-sender-id' };
}

// ─── ProtocolCodec ────────────────────────────────────────────────────────────

describe('createPacket', () => {
  it('creates a packet with correct structure', async () => {
    const { keyPair, senderId } = await makeIdentity();
    const payload: HelloPayload = { publicKey: 'pk', deviceId: 'dev-1' };
    const packet = await createPacket(MessageType.HELLO, senderId, payload, keyPair.privateKey);

    expect(packet.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(packet.messageType).toBe(MessageType.HELLO);
    expect(packet.senderId).toBe(senderId);
    expect(packet.payload).toEqual(payload);
    expect(typeof packet.messageId).toBe('string');
    expect(typeof packet.timestamp).toBe('number');
    expect(typeof packet.signature).toBe('string');
  });

  it('generates a unique messageId per packet', async () => {
    const { keyPair, senderId } = await makeIdentity();
    const payload: PingPayload = { nonce: 'abc' };
    const p1 = await createPacket(MessageType.PING, senderId, payload, keyPair.privateKey);
    const p2 = await createPacket(MessageType.PING, senderId, payload, keyPair.privateKey);
    expect(p1.messageId).not.toBe(p2.messageId);
  });
});

describe('verifyPacket', () => {
  it('returns true for a valid packet', async () => {
    const { keyPair, publicKeyB64, senderId } = await makeIdentity();
    const packet = await createPacket(
      MessageType.PING,
      senderId,
      { nonce: 'xyz' },
      keyPair.privateKey,
    );
    expect(await verifyPacket(packet, publicKeyB64)).toBe(true);
  });

  it('returns false when signature is tampered', async () => {
    const { keyPair, publicKeyB64, senderId } = await makeIdentity();
    const packet = await createPacket(
      MessageType.PING,
      senderId,
      { nonce: 'xyz' },
      keyPair.privateKey,
    );
    const tampered = { ...packet, payload: { nonce: 'tampered' } };
    expect(await verifyPacket(tampered, publicKeyB64)).toBe(false);
  });

  it('returns false when verified with wrong public key', async () => {
    const { keyPair, senderId } = await makeIdentity();
    const { publicKeyB64: wrongKey } = await makeIdentity();
    const packet = await createPacket(
      MessageType.PING,
      senderId,
      { nonce: 'xyz' },
      keyPair.privateKey,
    );
    expect(await verifyPacket(packet, wrongKey)).toBe(false);
  });

  it('returns false for invalid public key string', async () => {
    const { keyPair, senderId } = await makeIdentity();
    const packet = await createPacket(
      MessageType.PING,
      senderId,
      { nonce: 'xyz' },
      keyPair.privateKey,
    );
    expect(await verifyPacket(packet, 'not-a-valid-key')).toBe(false);
  });
});

describe('parsePacket', () => {
  it('parses a valid packet object', async () => {
    const { keyPair, senderId } = await makeIdentity();
    const packet = await createPacket(
      MessageType.HELLO,
      senderId,
      { publicKey: 'pk', deviceId: 'dev-1' },
      keyPair.privateKey,
    );
    expect(parsePacket(packet)).toEqual(packet);
  });

  it('returns null for non-object input', () => {
    expect(parsePacket('string')).toBeNull();
    expect(parsePacket(null)).toBeNull();
    expect(parsePacket(42)).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(parsePacket({ messageType: MessageType.PING })).toBeNull();
  });

  it('returns null for unknown messageType', () => {
    expect(parsePacket({
      protocolVersion: 1,
      messageType: 'UNKNOWN_TYPE',
      messageId: 'id',
      senderId: 'sender',
      timestamp: Date.now(),
      payload: {},
      signature: 'sig',
    })).toBeNull();
  });

  it('parses all known MessageType values', async () => {
    const { keyPair, senderId } = await makeIdentity();
    for (const type of Object.values(MessageType)) {
      const packet = await createPacket(
        type as MessageType.PING,
        senderId,
        { nonce: 'x' } as never,
        keyPair.privateKey,
      );
      expect(parsePacket(packet)).not.toBeNull();
    }
  });
});

// ─── ProtocolService ──────────────────────────────────────────────────────────

describe('ProtocolService.send', () => {
  beforeEach(() => {
    _sentPackets.length = 0;
    vi.clearAllMocks();
  });

  it('sends a signed packet to the transport', async () => {
    const { keyPair, senderId } = await makeIdentity();
    await ProtocolService.send(
      'room-1',
      MessageType.PING,
      { nonce: 'abc' },
      senderId,
      keyPair.privateKey,
    );
    expect(_sentPackets).toHaveLength(1);
    expect(_sentPackets[0].roomId).toBe('room-1');
    const sent = _sentPackets[0].data as { messageType: string };
    expect(sent.messageType).toBe(MessageType.PING);
  });

  it('passes targetPeerId to transport', async () => {
    const { keyPair, senderId } = await makeIdentity();
    await ProtocolService.send(
      'room-1',
      MessageType.PING,
      { nonce: 'abc' },
      senderId,
      keyPair.privateKey,
      'target-peer',
    );
    expect(_sentPackets[0].targetPeerId).toBe('target-peer');
  });
});

describe('ProtocolService.onMessage', () => {
  beforeEach(() => {
    _dataHandler = null;
    vi.clearAllMocks();
  });

  it('calls handler for matching message type', async () => {
    const { keyPair, senderId } = await makeIdentity();
    const handler = vi.fn();
    ProtocolService.onMessage(MessageType.PING, handler);

    const packet = await createPacket(
      MessageType.PING,
      senderId,
      { nonce: 'test' },
      keyPair.privateKey,
    );
    await _dataHandler?.(packet, 'peer-1', 'room-1');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].packet.messageType).toBe(MessageType.PING);
  });

  it('ignores packets of a different type', async () => {
    const { keyPair, senderId } = await makeIdentity();
    const handler = vi.fn();
    ProtocolService.onMessage(MessageType.PING, handler);

    const packet = await createPacket(
      MessageType.HELLO,
      senderId,
      { publicKey: 'pk', deviceId: 'dev-1' },
      keyPair.privateKey,
    );
    await _dataHandler?.(packet, 'peer-1', 'room-1');
    expect(handler).not.toHaveBeenCalled();
  });

  it('receives all types when type filter is null', async () => {
    const { keyPair, senderId } = await makeIdentity();
    const handler = vi.fn();
    ProtocolService.onMessage(null, handler);

    for (const type of [MessageType.PING, MessageType.HELLO, MessageType.LIKE]) {
      const packet = await createPacket(
        type as MessageType.PING,
        senderId,
        { nonce: 'x' } as never,
        keyPair.privateKey,
      );
      await _dataHandler?.(packet, 'peer-1', 'room-1');
    }
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('ignores malformed (non-packet) data', async () => {
    const handler = vi.fn();
    ProtocolService.onMessage(null, handler);
    await _dataHandler?.('not a packet', 'peer-1', 'room-1');
    await _dataHandler?.({ foo: 'bar' }, 'peer-1', 'room-1');
    expect(handler).not.toHaveBeenCalled();
  });

  it('verifies signature when getPublicKey is provided', async () => {
    const { keyPair, publicKeyB64, senderId } = await makeIdentity();
    const handler = vi.fn();
    ProtocolService.onMessage(MessageType.PING, handler, async () => publicKeyB64);

    const packet = await createPacket(
      MessageType.PING,
      senderId,
      { nonce: 'secure' },
      keyPair.privateKey,
    );
    await _dataHandler?.(packet, 'peer-1', 'room-1');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].verified).toBe(true);
  });

  it('drops packet when signature verification fails', async () => {
    const { keyPair, senderId } = await makeIdentity();
    const { publicKeyB64: wrongKey } = await makeIdentity();
    const handler = vi.fn();
    ProtocolService.onMessage(MessageType.PING, handler, async () => wrongKey);

    const packet = await createPacket(
      MessageType.PING,
      senderId,
      { nonce: 'secure' },
      keyPair.privateKey,
    );
    await _dataHandler?.(packet, 'peer-1', 'room-1');
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns unsubscribe function that stops delivery', async () => {
    const { keyPair, senderId } = await makeIdentity();
    const handler = vi.fn();
    const unsub = ProtocolService.onMessage(MessageType.PING, handler);
    unsub();

    const packet = await createPacket(
      MessageType.PING,
      senderId,
      { nonce: 'test' },
      keyPair.privateKey,
    );
    // _dataHandler is now null after unsubscribe
    await _dataHandler?.(packet, 'peer-1', 'room-1');
    expect(handler).not.toHaveBeenCalled();
  });

  it('includes peerId and roomId in the incoming packet', async () => {
    const { keyPair, senderId } = await makeIdentity();
    const handler = vi.fn();
    ProtocolService.onMessage(MessageType.PING, handler);

    const packet = await createPacket(
      MessageType.PING,
      senderId,
      { nonce: 'ctx' },
      keyPair.privateKey,
    );
    await _dataHandler?.(packet, 'peer-xyz', 'room-abc');
    expect(handler.mock.calls[0][0].peerId).toBe('peer-xyz');
    expect(handler.mock.calls[0][0].roomId).toBe('room-abc');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/repositories/db/database';
import type { DevicePairRequestPayload, DevicePairResponsePayload } from '@/types/protocol';

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

// ─── Mock webcrypto ───────────────────────────────────────────────────────────

vi.mock('@/infrastructure/crypto/webcrypto', () => ({
  generateKeyPair: vi.fn(async () => ({
    privateKey: { type: 'private' } as CryptoKey,
    publicKey: { type: 'public' } as CryptoKey,
  })),
  exportPublicKey: vi.fn(async () => 'mock-device-pub-key'),
  generateId: vi.fn(() => 'mock-generated-id'),
}));

import { PairingService } from '@/services/pairing/PairingService';
import { MessageType } from '@/types/protocol';

const ACCOUNT_ID = 'acc-local';
const ROOM_ID = 'nabor:h3:test-cell';
const MOCK_KEY = {} as CryptoKey;
const MOCK_NONCE = 'test-nonce-123';

const flush = () => Array.from({ length: 5 }, () => Promise.resolve()).reduce((p) => p.then(() => Promise.resolve()), Promise.resolve());

async function emitPairRequest(payload: DevicePairRequestPayload, peerId = 'new-device-peer') {
  const promises = (_handlers.get(MessageType.DEVICE_PAIR_REQUEST) ?? []).map((h) =>
    Promise.resolve(h({ packet: { payload, senderId: peerId }, peerId, roomId: ROOM_ID })),
  );
  await Promise.all(promises);
}

async function emitPairResponse(payload: DevicePairResponsePayload) {
  const promises = (_handlers.get(MessageType.DEVICE_PAIR_RESPONSE) ?? []).map((h) =>
    Promise.resolve(h({ packet: { payload, senderId: 'old-device-peer' }, peerId: 'old-device-peer', roomId: ROOM_ID })),
  );
  await Promise.all(promises);
}

beforeEach(async () => {
  await db.devices.clear();
  _sent.length = 0;
  _handlers.clear();
  vi.clearAllMocks();
  PairingService.clearPending();

  // Restore mock implementations after clearAllMocks
  const { generateKeyPair, exportPublicKey, generateId } = await import('@/infrastructure/crypto/webcrypto');
  vi.mocked(generateKeyPair).mockResolvedValue({
    privateKey: { type: 'private' } as CryptoKey,
    publicKey: { type: 'public' } as CryptoKey,
  });
  vi.mocked(exportPublicKey).mockResolvedValue('mock-device-pub-key');
  vi.mocked(generateId).mockReturnValue('mock-generated-id');
});

// ─── generateQRData ───────────────────────────────────────────────────────────

describe('PairingService.generateQRData', () => {
  it('returns qrData with accountId, deviceId, nonce, roomId', async () => {
    const { qrData } = await PairingService.generateQRData(ACCOUNT_ID, 'My Phone', ROOM_ID);
    expect(qrData.accountId).toBe(ACCOUNT_ID);
    expect(qrData.deviceId).toBe('mock-generated-id');
    expect(qrData.nonce).toBe('mock-generated-id');
    expect(qrData.roomId).toBe(ROOM_ID);
    expect(qrData.deviceName).toBe('My Phone');
  });

  it('returns the new device public key in qrData', async () => {
    const { qrData } = await PairingService.generateQRData(ACCOUNT_ID, 'My Phone', ROOM_ID);
    expect(qrData.devicePublicKey).toBe('mock-device-pub-key');
  });

  it('returns the private key for signing the pair request', async () => {
    const { privateKey } = await PairingService.generateQRData(ACCOUNT_ID, 'My Phone', ROOM_ID);
    expect(privateKey).toBeDefined();
  });
});

// ─── sendPairRequest ──────────────────────────────────────────────────────────

describe('PairingService.sendPairRequest', () => {
  const qrData = {
    accountId: ACCOUNT_ID,
    deviceId: 'new-dev-id',
    devicePublicKey: 'new-dev-pub',
    deviceName: 'New Phone',
    nonce: MOCK_NONCE,
    roomId: ROOM_ID,
  };

  it('sends a DEVICE_PAIR_REQUEST packet', async () => {
    PairingService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID, null);
    const promise = PairingService.sendPairRequest(qrData, MOCK_KEY, 5000);
    await flush();
    await emitPairResponse({ deviceId: 'new-dev-id', nonce: MOCK_NONCE, accepted: true });
    await promise;

    const pkt = _sent.find((s) => s.type === MessageType.DEVICE_PAIR_REQUEST);
    expect(pkt).toBeDefined();
    expect(pkt!.roomId).toBe(ROOM_ID);
    const payload = pkt!.payload as DevicePairRequestPayload;
    expect(payload.deviceId).toBe('new-dev-id');
    expect(payload.nonce).toBe(MOCK_NONCE);
    expect(payload.deviceName).toBe('New Phone');
  });

  it('resolves with accepted=true when response arrives', async () => {
    PairingService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID, null);
    const promise = PairingService.sendPairRequest(qrData, MOCK_KEY, 5000);
    await flush();
    await emitPairResponse({ deviceId: 'new-dev-id', nonce: MOCK_NONCE, accepted: true });
    const result = await promise;
    expect(result.accepted).toBe(true);
    expect(result.deviceId).toBe('new-dev-id');
  });

  it('resolves with accepted=false when rejected', async () => {
    PairingService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID, null);
    const promise = PairingService.sendPairRequest(qrData, MOCK_KEY, 5000);
    await flush();
    await emitPairResponse({ deviceId: 'new-dev-id', nonce: MOCK_NONCE, accepted: false });
    const result = await promise;
    expect(result.accepted).toBe(false);
  });

  it('rejects after timeout', async () => {
    await expect(
      PairingService.sendPairRequest(qrData, MOCK_KEY, 10),
    ).rejects.toThrow('Pairing timed out');
  });
});

// ─── handlePairRequest ────────────────────────────────────────────────────────

describe('PairingService.handlePairRequest', () => {
  const payload: DevicePairRequestPayload = {
    deviceId: 'new-dev-id',
    devicePublicKey: 'new-dev-pub',
    deviceName: 'New Phone',
    nonce: MOCK_NONCE,
  };

  it('saves the new device to DB when accepted', async () => {
    await PairingService.handlePairRequest(ROOM_ID, ACCOUNT_ID, MOCK_KEY, payload, MOCK_NONCE, true);
    const device = await db.devices.get('new-dev-id');
    expect(device).toBeDefined();
    expect(device!.accountId).toBe(ACCOUNT_ID);
    expect(device!.publicKey).toBe('new-dev-pub');
    expect(device!.name).toBe('New Phone');
  });

  it('does not save device when rejected', async () => {
    await PairingService.handlePairRequest(ROOM_ID, ACCOUNT_ID, MOCK_KEY, payload, MOCK_NONCE, false);
    const device = await db.devices.get('new-dev-id');
    expect(device).toBeUndefined();
  });

  it('sends DEVICE_PAIR_RESPONSE with accepted=true', async () => {
    await PairingService.handlePairRequest(ROOM_ID, ACCOUNT_ID, MOCK_KEY, payload, MOCK_NONCE, true);
    const pkt = _sent.find((s) => s.type === MessageType.DEVICE_PAIR_RESPONSE);
    expect(pkt).toBeDefined();
    expect((pkt!.payload as DevicePairResponsePayload).accepted).toBe(true);
    expect((pkt!.payload as DevicePairResponsePayload).nonce).toBe(MOCK_NONCE);
  });

  it('sends DEVICE_PAIR_RESPONSE with accepted=false', async () => {
    await PairingService.handlePairRequest(ROOM_ID, ACCOUNT_ID, MOCK_KEY, payload, MOCK_NONCE, false);
    const pkt = _sent.find((s) => s.type === MessageType.DEVICE_PAIR_RESPONSE);
    expect((pkt!.payload as DevicePairResponsePayload).accepted).toBe(false);
  });

  it('ignores request when nonce does not match', async () => {
    await PairingService.handlePairRequest(ROOM_ID, ACCOUNT_ID, MOCK_KEY, payload, 'wrong-nonce', true);
    expect(_sent).toHaveLength(0);
    expect(await db.devices.get('new-dev-id')).toBeUndefined();
  });
});

// ─── handlePairResponse ───────────────────────────────────────────────────────

describe('PairingService.handlePairResponse', () => {
  it('resolves a pending sendPairRequest', async () => {
    PairingService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID, null);
    const qrData = {
      accountId: ACCOUNT_ID, deviceId: 'dev-x', devicePublicKey: 'pub-x',
      deviceName: 'X', nonce: MOCK_NONCE, roomId: ROOM_ID,
    };
    const promise = PairingService.sendPairRequest(qrData, MOCK_KEY, 5000);
    await flush();
    PairingService.handlePairResponse({ deviceId: 'dev-x', nonce: MOCK_NONCE, accepted: true });
    const result = await promise;
    expect(result.accepted).toBe(true);
  });

  it('is a no-op for unknown nonce', () => {
    expect(() =>
      PairingService.handlePairResponse({ deviceId: 'dev-x', nonce: 'unknown', accepted: true }),
    ).not.toThrow();
  });
});

// ─── startListening ───────────────────────────────────────────────────────────

describe('PairingService.startListening', () => {
  it('wires DEVICE_PAIR_REQUEST and calls onPairRequest callback', async () => {
    const onPairRequest = vi.fn(async () => true);
    PairingService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID, MOCK_NONCE, onPairRequest);

    const payload: DevicePairRequestPayload = {
      deviceId: 'dev-y', devicePublicKey: 'pub-y', deviceName: 'Y', nonce: MOCK_NONCE,
    };
    await emitPairRequest(payload);

    expect(onPairRequest).toHaveBeenCalledWith(payload);
    const pkt = _sent.find((s) => s.type === MessageType.DEVICE_PAIR_RESPONSE);
    expect(pkt).toBeDefined();
  });

  it('saves device when onPairRequest returns true', async () => {
    PairingService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID, MOCK_NONCE, async () => true);

    await emitPairRequest({
      deviceId: 'dev-z', devicePublicKey: 'pub-z', deviceName: 'Z', nonce: MOCK_NONCE,
    });

    const device = await db.devices.get('dev-z');
    expect(device).toBeDefined();
  });

  it('does not save device when onPairRequest returns false', async () => {
    PairingService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID, MOCK_NONCE, async () => false);

    await emitPairRequest({
      deviceId: 'dev-w', devicePublicKey: 'pub-w', deviceName: 'W', nonce: MOCK_NONCE,
    });

    expect(await db.devices.get('dev-w')).toBeUndefined();
  });

  it('wires DEVICE_PAIR_RESPONSE and resolves pending request', async () => {
    PairingService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID, null);

    const qrData = {
      accountId: ACCOUNT_ID, deviceId: 'dev-r', devicePublicKey: 'pub-r',
      deviceName: 'R', nonce: MOCK_NONCE, roomId: ROOM_ID,
    };
    const promise = PairingService.sendPairRequest(qrData, MOCK_KEY, 5000);
    await flush();
    await emitPairResponse({ deviceId: 'dev-r', nonce: MOCK_NONCE, accepted: true });
    const result = await promise;
    expect(result.accepted).toBe(true);
  });

  it('returns unsubscribe that stops both handlers', async () => {
    const onPairRequest = vi.fn(async () => true);
    const unsub = PairingService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID, MOCK_NONCE, onPairRequest);
    unsub();

    await emitPairRequest({ deviceId: 'dev-q', devicePublicKey: 'pub-q', deviceName: 'Q', nonce: MOCK_NONCE });
    expect(onPairRequest).not.toHaveBeenCalled();
    expect(_sent).toHaveLength(0);
  });

  it('ignores DEVICE_PAIR_REQUEST when no onPairRequest callback provided', async () => {
    PairingService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID, MOCK_NONCE);
    await emitPairRequest({ deviceId: 'dev-p', devicePublicKey: 'pub-p', deviceName: 'P', nonce: MOCK_NONCE });
    expect(_sent).toHaveLength(0);
  });
});

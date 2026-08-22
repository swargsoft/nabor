import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/repositories/db/database';
import type { MediaRequestPayload, MediaResponsePayload } from '@/types/protocol';

// ─── jsdom shims ──────────────────────────────────────────────────────────────

globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');

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

// ─── Mock Cache API ───────────────────────────────────────────────────────────

const _cacheStore = new Map<string, Blob>();

vi.mock('@/infrastructure/media/imageProcessor', () => ({
  readFromCacheApi: vi.fn(async (key: string) => _cacheStore.get(key) ?? null),
  writeToCacheApi: vi.fn(async (key: string, blob: Blob) => { _cacheStore.set(key, blob); }),
}));

import { MediaExchangeService } from '@/services/media/MediaExchangeService';
import { MessageType } from '@/types/protocol';
import { readFromCacheApi, writeToCacheApi } from '@/infrastructure/media/imageProcessor';

const ACCOUNT_ID = 'acc-local';
const PEER_ID = 'acc-remote';
const ROOM_ID = 'nabor:h3:test-cell';
const MEDIA_ID = 'media-abc';
const MOCK_KEY = {} as CryptoKey;
const SAMPLE_BASE64 = btoa('fake-image-bytes');
const SAMPLE_MIME = 'image/jpeg';

const SAMPLE_MEDIA_RECORD = {
  id: MEDIA_ID, ownerId: ACCOUNT_ID, hash: 'abc', mimeType: SAMPLE_MIME,
  size: 100, width: 200, height: 200, cacheKey: `media/${MEDIA_ID}`,
  createdAt: 0, lastAccessedAt: 0,
};

/** Flush enough microtask ticks for async mock chains to settle. */
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

async function emitRequest(payload: MediaRequestPayload, peerId = PEER_ID) {
  const promises = (_handlers.get(MessageType.MEDIA_REQUEST) ?? []).map((h) =>
    Promise.resolve(h({ packet: { payload, senderId: peerId }, peerId, roomId: ROOM_ID })),
  );
  await Promise.all(promises);
}

async function emitResponse(payload: MediaResponsePayload, peerId = PEER_ID) {
  const promises = (_handlers.get(MessageType.MEDIA_RESPONSE) ?? []).map((h) =>
    Promise.resolve(h({ packet: { payload, senderId: peerId }, peerId, roomId: ROOM_ID })),
  );
  await Promise.all(promises);
}

beforeEach(async () => {
  await db.media.clear();
  _sent.length = 0;
  _handlers.clear();
  _cacheStore.clear();
  MediaExchangeService.clearPending();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  // Restore mock implementations (vi.mock factory runs once; implementations persist)
  vi.mocked(readFromCacheApi).mockImplementation(async (key) => _cacheStore.get(key) ?? null);
  vi.mocked(writeToCacheApi).mockImplementation(async (key, blob) => { _cacheStore.set(key, blob); });
});

// ─── requestMedia ─────────────────────────────────────────────────────────────

describe('MediaExchangeService.requestMedia', () => {
  it('sends a MEDIA_REQUEST packet to the target peer', async () => {
    MediaExchangeService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID);
    const promise = MediaExchangeService.requestMedia(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, MEDIA_ID, false);
    await flush();
    const req = _sent.find((s) => s.type === MessageType.MEDIA_REQUEST);
    expect(req).toBeDefined();
    expect(req!.targetPeerId).toBe(PEER_ID);
    expect((req!.payload as MediaRequestPayload).mediaId).toBe(MEDIA_ID);
    expect((req!.payload as MediaRequestPayload).thumbnail).toBe(false);
    await emitResponse({ mediaId: MEDIA_ID, thumbnail: false, data: SAMPLE_BASE64, mimeType: SAMPLE_MIME });
    await promise;
  });

  it('resolves with a URL when response arrives', async () => {
    MediaExchangeService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID);
    const promise = MediaExchangeService.requestMedia(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, MEDIA_ID, false);
    await flush();
    await emitResponse({ mediaId: MEDIA_ID, thumbnail: false, data: SAMPLE_BASE64, mimeType: SAMPLE_MIME });
    const url = await promise;
    expect(typeof url).toBe('string');
  });

  it('requests thumbnail when thumbnail=true', async () => {
    MediaExchangeService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID);
    const promise = MediaExchangeService.requestMedia(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, MEDIA_ID, true);
    await flush();
    expect((_sent[0].payload as MediaRequestPayload).thumbnail).toBe(true);
    await emitResponse({ mediaId: MEDIA_ID, thumbnail: true, data: SAMPLE_BASE64, mimeType: SAMPLE_MIME });
    await promise;
  });

  it('rejects after timeout', async () => {
    const promise = MediaExchangeService.requestMedia(
      ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, MEDIA_ID, false, 10,
    );
    await expect(promise).rejects.toThrow('timed out');
  });
});

// ─── handleMediaRequest ───────────────────────────────────────────────────────

describe('MediaExchangeService.handleMediaRequest', () => {
  beforeEach(async () => {
    await db.media.put(SAMPLE_MEDIA_RECORD);
    _cacheStore.set(`media/${MEDIA_ID}`, new Blob(['img'], { type: SAMPLE_MIME }));
    _cacheStore.set(`media/${MEDIA_ID}/thumb`, new Blob(['thumb'], { type: SAMPLE_MIME }));
  });

  it('sends a MEDIA_RESPONSE with base64 data', async () => {
    await MediaExchangeService.handleMediaRequest(
      ROOM_ID, ACCOUNT_ID, MOCK_KEY, { mediaId: MEDIA_ID, thumbnail: false }, PEER_ID,
    );
    const res = _sent.find((s) => s.type === MessageType.MEDIA_RESPONSE);
    expect(res).toBeDefined();
    expect(res!.targetPeerId).toBe(PEER_ID);
    expect((res!.payload as MediaResponsePayload).mediaId).toBe(MEDIA_ID);
    expect(typeof (res!.payload as MediaResponsePayload).data).toBe('string');
  });

  it('sends thumbnail blob when thumbnail=true', async () => {
    await MediaExchangeService.handleMediaRequest(
      ROOM_ID, ACCOUNT_ID, MOCK_KEY, { mediaId: MEDIA_ID, thumbnail: true }, PEER_ID,
    );
    const res = _sent.find((s) => s.type === MessageType.MEDIA_RESPONSE);
    expect((res!.payload as MediaResponsePayload).thumbnail).toBe(true);
  });

  it('does nothing for unknown mediaId', async () => {
    await MediaExchangeService.handleMediaRequest(
      ROOM_ID, ACCOUNT_ID, MOCK_KEY, { mediaId: 'ghost', thumbnail: false }, PEER_ID,
    );
    expect(_sent).toHaveLength(0);
  });

  it('does nothing when blob is not in cache', async () => {
    _cacheStore.clear();
    await MediaExchangeService.handleMediaRequest(
      ROOM_ID, ACCOUNT_ID, MOCK_KEY, { mediaId: MEDIA_ID, thumbnail: false }, PEER_ID,
    );
    expect(_sent).toHaveLength(0);
  });
});

// ─── handleMediaResponse ──────────────────────────────────────────────────────

describe('MediaExchangeService.handleMediaResponse', () => {
  it('writes the blob to Cache API', async () => {
    await MediaExchangeService.handleMediaResponse({
      mediaId: MEDIA_ID, thumbnail: false, data: SAMPLE_BASE64, mimeType: SAMPLE_MIME,
    });
    expect(writeToCacheApi).toHaveBeenCalledWith(`media/${MEDIA_ID}`, expect.any(Blob));
  });

  it('writes thumbnail to correct cache key', async () => {
    await MediaExchangeService.handleMediaResponse({
      mediaId: MEDIA_ID, thumbnail: true, data: SAMPLE_BASE64, mimeType: SAMPLE_MIME,
    });
    expect(writeToCacheApi).toHaveBeenCalledWith(`media/${MEDIA_ID}/thumb`, expect.any(Blob));
  });

  it('returns a URL string', async () => {
    const url = await MediaExchangeService.handleMediaResponse({
      mediaId: MEDIA_ID, thumbnail: false, data: SAMPLE_BASE64, mimeType: SAMPLE_MIME,
    });
    expect(typeof url).toBe('string');
  });

  it('resolves a pending requestMedia promise', async () => {
    MediaExchangeService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID);
    const promise = MediaExchangeService.requestMedia(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, MEDIA_ID, false);
    await flush();
    await MediaExchangeService.handleMediaResponse({
      mediaId: MEDIA_ID, thumbnail: false, data: SAMPLE_BASE64, mimeType: SAMPLE_MIME,
    });
    await expect(promise).resolves.toBeDefined();
  });
});

// ─── startListening ───────────────────────────────────────────────────────────

describe('MediaExchangeService.startListening', () => {
  it('wires MEDIA_REQUEST handler', async () => {
    await db.media.put(SAMPLE_MEDIA_RECORD);
    _cacheStore.set(`media/${MEDIA_ID}`, new Blob(['img'], { type: SAMPLE_MIME }));
    MediaExchangeService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID);
    await emitRequest({ mediaId: MEDIA_ID, thumbnail: false });
    expect(_sent.find((s) => s.type === MessageType.MEDIA_RESPONSE)).toBeDefined();
  });

  it('wires MEDIA_RESPONSE handler and writes to cache', async () => {
    MediaExchangeService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID);
    await emitResponse({ mediaId: MEDIA_ID, thumbnail: false, data: SAMPLE_BASE64, mimeType: SAMPLE_MIME });
    expect(writeToCacheApi).toHaveBeenCalled();
  });

  it('returns unsubscribe that stops both handlers', async () => {
    vi.mocked(writeToCacheApi).mockClear();
    const unsub = MediaExchangeService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID);
    unsub();
    await emitResponse({ mediaId: MEDIA_ID, thumbnail: false, data: SAMPLE_BASE64, mimeType: SAMPLE_MIME });
    expect(writeToCacheApi).not.toHaveBeenCalled();
  });

  it('skips MEDIA_REQUEST when getRoomForPeer returns undefined', async () => {
    await db.media.put(SAMPLE_MEDIA_RECORD);
    _cacheStore.set(`media/${MEDIA_ID}`, new Blob(['img'], { type: SAMPLE_MIME }));
    MediaExchangeService.startListening(ACCOUNT_ID, MOCK_KEY, () => undefined);
    await emitRequest({ mediaId: MEDIA_ID, thumbnail: false });
    expect(_sent).toHaveLength(0);
  });
});

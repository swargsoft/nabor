import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/repositories/db/database';
import type { ProfileRequestPayload, ProfileResponsePayload } from '@/types/protocol';

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

import { ProfileExchangeService } from '@/services/profile/ProfileExchangeService';
import { MessageType } from '@/types/protocol';

const ACCOUNT_ID = 'acc-local';
const PEER_ID = 'acc-remote';
const ROOM_ID = 'nabor:h3:test-cell';
const MOCK_KEY = {} as CryptoKey;

const SAMPLE_RESPONSE: ProfileResponsePayload = {
  requestId: '',
  accountId: PEER_ID,
  displayName: 'Alice',
  age: 28,
  bio: 'Hello',
  gender: 'woman',
  interests: ['hiking'],
  photoIds: ['photo-1'],
};

/** Flush enough microtask ticks for async mock chains to settle. */
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

async function emitRequest(payload: ProfileRequestPayload, peerId = PEER_ID) {
  const promises = (_handlers.get(MessageType.PROFILE_REQUEST) ?? []).map((h) =>
    Promise.resolve(h({ packet: { payload, senderId: peerId }, peerId, roomId: ROOM_ID })),
  );
  await Promise.all(promises);
}

async function emitResponse(payload: ProfileResponsePayload, peerId = PEER_ID) {
  const promises = (_handlers.get(MessageType.PROFILE_RESPONSE) ?? []).map((h) =>
    Promise.resolve(h({ packet: { payload, senderId: peerId }, peerId, roomId: ROOM_ID })),
  );
  await Promise.all(promises);
}

beforeEach(async () => {
  await db.profiles.clear();
  _sent.length = 0;
  _handlers.clear();
  ProfileExchangeService.clearCache();
});

// ─── requestProfile ───────────────────────────────────────────────────────────

describe('ProfileExchangeService.requestProfile', () => {
  it('sends a PROFILE_REQUEST packet to the target peer', async () => {
    ProfileExchangeService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID);
    const promise = ProfileExchangeService.requestProfile(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID);
    await flush();
    const req = _sent.find((s) => s.type === MessageType.PROFILE_REQUEST);
    expect(req).toBeDefined();
    expect(req!.targetPeerId).toBe(PEER_ID);
    const requestId = (req!.payload as ProfileRequestPayload).requestId;
    await emitResponse({ ...SAMPLE_RESPONSE, requestId });
    await promise;
  });

  it('resolves with the peer profile when response arrives', async () => {
    ProfileExchangeService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID);
    const promise = ProfileExchangeService.requestProfile(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID);
    await flush();
    const requestId = (_sent[0].payload as ProfileRequestPayload).requestId;
    await emitResponse({ ...SAMPLE_RESPONSE, requestId });
    const profile = await promise;
    expect(profile.displayName).toBe('Alice');
    expect(profile.accountId).toBe(PEER_ID);
  });

  it('caches the profile after response', async () => {
    ProfileExchangeService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID);
    const promise = ProfileExchangeService.requestProfile(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID);
    await flush();
    const requestId = (_sent[0].payload as ProfileRequestPayload).requestId;
    await emitResponse({ ...SAMPLE_RESPONSE, requestId });
    await promise;
    expect(ProfileExchangeService.getCachedProfile(PEER_ID)?.displayName).toBe('Alice');
  });

  it('rejects after timeout', async () => {
    const promise = ProfileExchangeService.requestProfile(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID, 10);
    await expect(promise).rejects.toThrow('timed out');
  });
});

// ─── handleProfileRequest ─────────────────────────────────────────────────────

describe('ProfileExchangeService.handleProfileRequest', () => {
  it('sends a PROFILE_RESPONSE with our profile', async () => {
    await db.profiles.put({
      id: ACCOUNT_ID, displayName: 'Bob', age: 30, bio: 'Hi', gender: 'man',
      interests: ['music'], photoIds: [], locationEnabled: true, updatedAt: 0,
    });
    await ProfileExchangeService.handleProfileRequest(
      ROOM_ID, ACCOUNT_ID, MOCK_KEY, { requestId: 'req-1' }, PEER_ID,
    );
    const res = _sent.find((s) => s.type === MessageType.PROFILE_RESPONSE);
    expect(res).toBeDefined();
    expect(res!.targetPeerId).toBe(PEER_ID);
    expect((res!.payload as ProfileResponsePayload).displayName).toBe('Bob');
    expect((res!.payload as ProfileResponsePayload).requestId).toBe('req-1');
  });

  it('does nothing when no local profile exists', async () => {
    await ProfileExchangeService.handleProfileRequest(
      ROOM_ID, ACCOUNT_ID, MOCK_KEY, { requestId: 'req-2' }, PEER_ID,
    );
    expect(_sent).toHaveLength(0);
  });

  it('does not include locationEnabled in the response', async () => {
    await db.profiles.put({
      id: ACCOUNT_ID, displayName: 'Bob', age: 30, bio: 'Hi', gender: 'man',
      interests: [], photoIds: [], locationEnabled: true, updatedAt: 0,
    });
    await ProfileExchangeService.handleProfileRequest(
      ROOM_ID, ACCOUNT_ID, MOCK_KEY, { requestId: 'req-3' }, PEER_ID,
    );
    const payload = _sent[0].payload as Record<string, unknown>;
    expect(payload.locationEnabled).toBeUndefined();
  });
});

// ─── handleProfileResponse ────────────────────────────────────────────────────

describe('ProfileExchangeService.handleProfileResponse', () => {
  it('caches the profile by peerId', () => {
    ProfileExchangeService.handleProfileResponse({ ...SAMPLE_RESPONSE, requestId: 'r' }, PEER_ID);
    expect(ProfileExchangeService.getCachedProfile(PEER_ID)?.displayName).toBe('Alice');
  });

  it('resolves a pending request by requestId', async () => {
    ProfileExchangeService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID);
    const promise = ProfileExchangeService.requestProfile(ROOM_ID, ACCOUNT_ID, MOCK_KEY, PEER_ID);
    await flush();
    const requestId = (_sent[0].payload as ProfileRequestPayload).requestId;
    ProfileExchangeService.handleProfileResponse({ ...SAMPLE_RESPONSE, requestId }, PEER_ID);
    const profile = await promise;
    expect(profile.age).toBe(28);
  });
});

// ─── startListening ───────────────────────────────────────────────────────────

describe('ProfileExchangeService.startListening', () => {
  it('wires PROFILE_REQUEST handler', async () => {
    await db.profiles.put({
      id: ACCOUNT_ID, displayName: 'Bob', age: 30, bio: '', gender: 'man',
      interests: [], photoIds: [], locationEnabled: true, updatedAt: 0,
    });
    ProfileExchangeService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID);
    await emitRequest({ requestId: 'req-x' });
    expect(_sent.find((s) => s.type === MessageType.PROFILE_RESPONSE)).toBeDefined();
  });

  it('wires PROFILE_RESPONSE handler and caches profile', async () => {
    ProfileExchangeService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID);
    await emitResponse({ ...SAMPLE_RESPONSE, requestId: 'r' });
    expect(ProfileExchangeService.getCachedProfile(PEER_ID)).not.toBeNull();
  });

  it('returns unsubscribe that stops both handlers', async () => {
    const unsub = ProfileExchangeService.startListening(ACCOUNT_ID, MOCK_KEY, () => ROOM_ID);
    unsub();
    await emitResponse({ ...SAMPLE_RESPONSE, requestId: 'r' });
    expect(ProfileExchangeService.getCachedProfile(PEER_ID)).toBeNull();
  });

  it('skips PROFILE_REQUEST when getRoomForPeer returns undefined', async () => {
    await db.profiles.put({
      id: ACCOUNT_ID, displayName: 'Bob', age: 30, bio: '', gender: 'man',
      interests: [], photoIds: [], locationEnabled: true, updatedAt: 0,
    });
    ProfileExchangeService.startListening(ACCOUNT_ID, MOCK_KEY, () => undefined);
    await emitRequest({ requestId: 'req-y' });
    expect(_sent).toHaveLength(0);
  });
});

// ─── cache helpers ────────────────────────────────────────────────────────────

describe('ProfileExchangeService cache', () => {
  it('returns null for unknown peer', () => {
    expect(ProfileExchangeService.getCachedProfile('unknown')).toBeNull();
  });

  it('clearCache removes all entries', () => {
    ProfileExchangeService.handleProfileResponse({ ...SAMPLE_RESPONSE, requestId: 'r' }, PEER_ID);
    ProfileExchangeService.clearCache();
    expect(ProfileExchangeService.getCachedProfile(PEER_ID)).toBeNull();
  });
});

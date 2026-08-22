import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock all services ────────────────────────────────────────────────────────

vi.mock('@/services/discovery/DiscoveryService', () => ({
  DiscoveryService: {
    startDiscovery: vi.fn(),
    stopDiscovery: vi.fn(),
    getContext: vi.fn(),
  },
}));

vi.mock('@/services/messaging/HandshakeService', () => ({
  HandshakeService: {
    broadcastHello: vi.fn(),
    startListening: vi.fn(),
    clearRegistry: vi.fn(),
  },
}));

vi.mock('@/services/profile/ProfileExchangeService', () => ({
  ProfileExchangeService: {
    startListening: vi.fn(),
    clearCache: vi.fn(),
  },
}));

vi.mock('@/services/media/MediaExchangeService', () => ({
  MediaExchangeService: {
    startListening: vi.fn(),
    clearPending: vi.fn(),
  },
}));

vi.mock('@/services/messaging/MessagingService', () => ({
  MessagingService: {
    onMessage: vi.fn(),
    onAck: vi.fn(),
  },
}));

vi.mock('@/services/matching/MatchingService', () => ({
  MatchingService: {
    onLike: vi.fn(),
    onMatch: vi.fn(),
  },
}));

vi.mock('@/services/messaging/MessageSyncService', () => ({
  MessageSyncService: {
    startListening: vi.fn(),
  },
}));

const mockStrategy = {
  join: vi.fn(),
  leave: vi.fn(),
  announce: vi.fn(),
  discover: vi.fn(),
  onData: vi.fn(),
  onPeerJoin: vi.fn(),
  onPeerLeave: vi.fn(),
  leaveAll: vi.fn(),
  getRoomIds: vi.fn(() => []),
};

vi.mock('@/infrastructure/discovery/DiscoveryStrategyRegistry', () => ({
  DiscoveryStrategyRegistry: {
    get: vi.fn(() => mockStrategy),
    set: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock('@/services/connection/ConnectionService', () => ({
  ConnectionService: {
    onPeerConnected: vi.fn(),
    onPeerDisconnected: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock('@/services/safety/SafetyService', () => ({
  SafetyService: {
    clearMutes: vi.fn(),
  },
}));

vi.mock('@/infrastructure/crypto/webcrypto', () => ({
  deriveKeyPairFromSeed: vi.fn(async () => ({
    privateKey: { type: 'private' } as CryptoKey,
    publicKey: { type: 'public' } as CryptoKey,
  })),
  exportPublicKey: vi.fn(async () => 'mock-public-key'),
}));

import { SessionService } from '@/services/SessionService';
import { DiscoveryService } from '@/services/discovery/DiscoveryService';
import { HandshakeService } from '@/services/messaging/HandshakeService';
import { ProfileExchangeService } from '@/services/profile/ProfileExchangeService';
import { MediaExchangeService } from '@/services/media/MediaExchangeService';
import { MessagingService } from '@/services/messaging/MessagingService';
import { MatchingService } from '@/services/matching/MatchingService';
import { MessageSyncService } from '@/services/messaging/MessageSyncService';
import { ConnectionService } from '@/services/connection/ConnectionService';
import type { Identity, Device } from '@/types/db';

const MOCK_IDENTITY: Identity = {
  id: 'acc-1',
  publicKey: 'mock-pub-key',
  privateKey: btoa('a'.repeat(32)),
  createdAt: 0,
};

const MOCK_DEVICE: Device = {
  id: 'dev-1',
  accountId: 'acc-1',
  publicKey: 'mock-dev-pub',
  name: 'Test Device',
  createdAt: 0,
  lastSeenAt: 0,
};

const DEFAULT_CTX = { activeRooms: ['room-1', 'room-2'], peerCount: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  SessionService._reset();

  vi.mocked(DiscoveryService.startDiscovery).mockResolvedValue(DEFAULT_CTX);
  vi.mocked(DiscoveryService.stopDiscovery).mockResolvedValue(undefined);
  vi.mocked(DiscoveryService.getContext).mockReturnValue(DEFAULT_CTX);
  vi.mocked(HandshakeService.broadcastHello).mockResolvedValue(undefined);
  vi.mocked(HandshakeService.startListening).mockReturnValue(vi.fn());
  vi.mocked(ProfileExchangeService.startListening).mockReturnValue(vi.fn());
  vi.mocked(MediaExchangeService.startListening).mockReturnValue(vi.fn());
  vi.mocked(MessagingService.onMessage).mockReturnValue(vi.fn());
  vi.mocked(MessagingService.onAck).mockReturnValue(vi.fn());
  vi.mocked(MatchingService.onLike).mockReturnValue(vi.fn());
  vi.mocked(MatchingService.onMatch).mockReturnValue(vi.fn());
  vi.mocked(MessageSyncService.startListening).mockReturnValue(vi.fn());
  mockStrategy.onPeerJoin.mockReturnValue(vi.fn());
  mockStrategy.onPeerLeave.mockReturnValue(vi.fn());
});

// ─── start ────────────────────────────────────────────────────────────────────

describe('SessionService.start', () => {
  it('returns active state after start', async () => {
    const state = await SessionService.start(MOCK_IDENTITY, MOCK_DEVICE);
    expect(state.status).toBe('active');
    expect(state.accountId).toBe('acc-1');
  });

  it('calls startDiscovery with accountId', async () => {
    await SessionService.start(MOCK_IDENTITY, MOCK_DEVICE);
    expect(DiscoveryService.startDiscovery).toHaveBeenCalledWith('acc-1');
  });

  it('broadcasts HELLO to every active room', async () => {
    await SessionService.start(MOCK_IDENTITY, MOCK_DEVICE);
    expect(HandshakeService.broadcastHello).toHaveBeenCalledTimes(2);
    const rooms = vi.mocked(HandshakeService.broadcastHello).mock.calls.map((c) => c[0]);
    expect(rooms).toEqual(['room-1', 'room-2']);
  });

  it('includes displayName in HELLO when profile provided', async () => {
    const profile = {
      id: 'acc-1', displayName: 'Alice', age: 28, bio: '', gender: 'woman' as const,
      interests: [], photoIds: [], locationEnabled: true, updatedAt: 0,
    };
    await SessionService.start(MOCK_IDENTITY, MOCK_DEVICE, profile);
    expect(vi.mocked(HandshakeService.broadcastHello).mock.calls[0][5]).toBe('Alice');
  });

  it('starts all protocol listeners', async () => {
    await SessionService.start(MOCK_IDENTITY, MOCK_DEVICE);
    expect(HandshakeService.startListening).toHaveBeenCalledOnce();
    expect(ProfileExchangeService.startListening).toHaveBeenCalledOnce();
    expect(MediaExchangeService.startListening).toHaveBeenCalledOnce();
    expect(MessagingService.onMessage).toHaveBeenCalledOnce();
    expect(MessagingService.onAck).toHaveBeenCalledOnce();
    expect(MatchingService.onLike).toHaveBeenCalledOnce();
    expect(MatchingService.onMatch).toHaveBeenCalledOnce();
    expect(MessageSyncService.startListening).toHaveBeenCalledOnce();
    expect(mockStrategy.onPeerJoin).toHaveBeenCalledOnce();
    expect(mockStrategy.onPeerLeave).toHaveBeenCalledOnce();
  });

  it('sets activeRooms and peerCount from discovery context', async () => {
    const state = await SessionService.start(MOCK_IDENTITY, MOCK_DEVICE);
    expect(state.activeRooms).toEqual(['room-1', 'room-2']);
    expect(state.peerCount).toBe(3);
  });

  it('is idempotent — second call returns existing active state without re-starting', async () => {
    await SessionService.start(MOCK_IDENTITY, MOCK_DEVICE);
    await SessionService.start(MOCK_IDENTITY, MOCK_DEVICE);
    expect(DiscoveryService.startDiscovery).toHaveBeenCalledTimes(1);
  });

  it('sets error state when startDiscovery throws', async () => {
    vi.mocked(DiscoveryService.startDiscovery).mockRejectedValueOnce(
      new Error('Location not set'),
    );
    await expect(SessionService.start(MOCK_IDENTITY, MOCK_DEVICE)).rejects.toThrow('Location not set');
    expect(SessionService.getState().status).toBe('error');
    expect(SessionService.getState().error).toBe('Location not set');
  });
});

// ─── stop ─────────────────────────────────────────────────────────────────────

describe('SessionService.stop', () => {
  it('returns idle state after stop', async () => {
    await SessionService.start(MOCK_IDENTITY, MOCK_DEVICE);
    await SessionService.stop();
    expect(SessionService.getState().status).toBe('idle');
  });

  it('calls stopDiscovery', async () => {
    await SessionService.start(MOCK_IDENTITY, MOCK_DEVICE);
    await SessionService.stop();
    expect(DiscoveryService.stopDiscovery).toHaveBeenCalled();
  });

  it('calls all cleanup functions', async () => {
    await SessionService.start(MOCK_IDENTITY, MOCK_DEVICE);
    await SessionService.stop();
    expect(HandshakeService.clearRegistry).toHaveBeenCalled();
    expect(ProfileExchangeService.clearCache).toHaveBeenCalled();
    expect(MediaExchangeService.clearPending).toHaveBeenCalled();
    expect(ConnectionService.clear).toHaveBeenCalled();
  });

  it('calls all unsubscribe functions returned by listeners', async () => {
    const unsubs = Array.from({ length: 10 }, () => vi.fn());
    let i = 0;
    vi.mocked(HandshakeService.startListening).mockReturnValueOnce(unsubs[i++]);
    vi.mocked(ProfileExchangeService.startListening).mockReturnValueOnce(unsubs[i++]);
    vi.mocked(MediaExchangeService.startListening).mockReturnValueOnce(unsubs[i++]);
    vi.mocked(MessagingService.onMessage).mockReturnValueOnce(unsubs[i++]);
    vi.mocked(MessagingService.onAck).mockReturnValueOnce(unsubs[i++]);
    vi.mocked(MatchingService.onLike).mockReturnValueOnce(unsubs[i++]);
    vi.mocked(MatchingService.onMatch).mockReturnValueOnce(unsubs[i++]);
    vi.mocked(MessageSyncService.startListening).mockReturnValueOnce(unsubs[i++]);
    mockStrategy.onPeerJoin.mockReturnValueOnce(unsubs[i++]);
    mockStrategy.onPeerLeave.mockReturnValueOnce(unsubs[i++]);

    await SessionService.start(MOCK_IDENTITY, MOCK_DEVICE);
    await SessionService.stop();

    for (const unsub of unsubs) expect(unsub).toHaveBeenCalledOnce();
  });

  it('resets accountId and rooms to null/empty', async () => {
    await SessionService.start(MOCK_IDENTITY, MOCK_DEVICE);
    await SessionService.stop();
    const state = SessionService.getState();
    expect(state.accountId).toBeNull();
    expect(state.activeRooms).toHaveLength(0);
    expect(state.peerCount).toBe(0);
  });
});

// ─── getState / refreshPeerCount ──────────────────────────────────────────────

describe('SessionService.getState', () => {
  it('returns idle state before start', () => {
    expect(SessionService.getState().status).toBe('idle');
  });

  it('refreshPeerCount updates peerCount from discovery context', async () => {
    await SessionService.start(MOCK_IDENTITY, MOCK_DEVICE);
    vi.mocked(DiscoveryService.getContext).mockReturnValue({ activeRooms: ['room-1'], peerCount: 10 });
    SessionService.refreshPeerCount();
    expect(SessionService.getState().peerCount).toBe(10);
  });

  it('refreshPeerCount is a no-op when not active', () => {
    SessionService.refreshPeerCount();
    expect(SessionService.getState().peerCount).toBe(0);
  });
});

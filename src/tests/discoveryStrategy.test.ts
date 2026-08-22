import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiscoveryStrategyRegistry } from '@/infrastructure/discovery/DiscoveryStrategyRegistry';
import { WebTorrentStrategy } from '@/infrastructure/discovery/WebTorrentStrategy';
import type { DiscoveryStrategy } from '@/infrastructure/discovery/DiscoveryStrategy';

// ─── Mock DiscoveryTransport ──────────────────────────────────────────────────

const mockTransport = vi.hoisted(() => ({
  joinRoom: vi.fn().mockResolvedValue(undefined),
  leaveRoom: vi.fn().mockResolvedValue(undefined),
  leaveAll: vi.fn().mockResolvedValue(undefined),
  send: vi.fn(),
  onData: vi.fn(() => vi.fn()),
  onPeerJoin: vi.fn(() => vi.fn()),
  onPeerLeave: vi.fn(() => vi.fn()),
  getRoomIds: vi.fn(() => ['room-1', 'room-2']),
  isInRoom: vi.fn(() => false),
  peers: {
    getPeersInRoom: vi.fn(() => ['peer-a', 'peer-b']),
    getPeerCount: vi.fn(() => 2),
    getPeer: vi.fn(() => undefined),
    isConnected: vi.fn(() => false),
    clear: vi.fn(),
    onPeerJoined: vi.fn(),
    onPeerLeft: vi.fn(),
  },
}));

vi.mock('@/infrastructure/trystero/DiscoveryTransport', () => ({
  discoveryTransport: mockTransport,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockTransport.joinRoom.mockResolvedValue(undefined);
  mockTransport.leaveRoom.mockResolvedValue(undefined);
  mockTransport.leaveAll.mockResolvedValue(undefined);
  mockTransport.getRoomIds.mockReturnValue(['room-1', 'room-2']);
  mockTransport.peers.getPeersInRoom.mockReturnValue(['peer-a', 'peer-b']);
  mockTransport.onData.mockReturnValue(vi.fn());
  mockTransport.onPeerJoin.mockReturnValue(vi.fn());
  mockTransport.onPeerLeave.mockReturnValue(vi.fn());
  DiscoveryStrategyRegistry.reset();
});

// ─── WebTorrentStrategy ───────────────────────────────────────────────────────

describe('WebTorrentStrategy', () => {
  it('join delegates to transport.joinRoom', async () => {
    const strategy = new WebTorrentStrategy(mockTransport as never);
    await strategy.join('room-1');
    expect(mockTransport.joinRoom).toHaveBeenCalledWith('room-1');
  });

  it('leave delegates to transport.leaveRoom', async () => {
    const strategy = new WebTorrentStrategy(mockTransport as never);
    await strategy.leave('room-1');
    expect(mockTransport.leaveRoom).toHaveBeenCalledWith('room-1');
  });

  it('announce delegates to transport.send', async () => {
    const strategy = new WebTorrentStrategy(mockTransport as never);
    await strategy.announce('room-1', { type: 'HELLO' });
    expect(mockTransport.send).toHaveBeenCalledWith('room-1', { type: 'HELLO' }, undefined);
  });

  it('announce with targetPeerId passes it to transport.send', async () => {
    const strategy = new WebTorrentStrategy(mockTransport as never);
    await strategy.announce('room-1', { type: 'HELLO' }, 'peer-x');
    expect(mockTransport.send).toHaveBeenCalledWith('room-1', { type: 'HELLO' }, 'peer-x');
  });

  it('discover returns peers in room as Peer objects', async () => {
    const strategy = new WebTorrentStrategy(mockTransport as never);
    const peers = await strategy.discover('room-1');
    expect(peers).toEqual([
      { id: 'peer-a', roomId: 'room-1' },
      { id: 'peer-b', roomId: 'room-1' },
    ]);
  });

  it('discover returns empty array when no peers in room', async () => {
    mockTransport.peers.getPeersInRoom.mockReturnValue([]);
    const strategy = new WebTorrentStrategy(mockTransport as never);
    const peers = await strategy.discover('room-1');
    expect(peers).toHaveLength(0);
  });

  it('onData delegates to transport.onData and returns unsubscribe', () => {
    const strategy = new WebTorrentStrategy(mockTransport as never);
    const handler = vi.fn();
    const unsub = strategy.onData(handler);
    expect(mockTransport.onData).toHaveBeenCalledWith(handler);
    expect(typeof unsub).toBe('function');
  });

  it('onPeerJoin delegates to transport.onPeerJoin', () => {
    const strategy = new WebTorrentStrategy(mockTransport as never);
    const handler = vi.fn();
    strategy.onPeerJoin(handler);
    expect(mockTransport.onPeerJoin).toHaveBeenCalledWith(handler);
  });

  it('onPeerLeave delegates to transport.onPeerLeave', () => {
    const strategy = new WebTorrentStrategy(mockTransport as never);
    const handler = vi.fn();
    strategy.onPeerLeave(handler);
    expect(mockTransport.onPeerLeave).toHaveBeenCalledWith(handler);
  });

  it('leaveAll delegates to transport.leaveAll', async () => {
    const strategy = new WebTorrentStrategy(mockTransport as never);
    await strategy.leaveAll();
    expect(mockTransport.leaveAll).toHaveBeenCalled();
  });

  it('getRoomIds delegates to transport.getRoomIds', () => {
    const strategy = new WebTorrentStrategy(mockTransport as never);
    expect(strategy.getRoomIds()).toEqual(['room-1', 'room-2']);
  });
});

// ─── DiscoveryStrategyRegistry ────────────────────────────────────────────────

describe('DiscoveryStrategyRegistry', () => {
  it('get() returns a WebTorrentStrategy by default', () => {
    const strategy = DiscoveryStrategyRegistry.get();
    expect(strategy).toBeInstanceOf(WebTorrentStrategy);
  });

  it('get() returns the same instance on repeated calls', () => {
    const a = DiscoveryStrategyRegistry.get();
    const b = DiscoveryStrategyRegistry.get();
    expect(a).toBe(b);
  });

  it('set() replaces the active strategy', async () => {
    const custom: DiscoveryStrategy = {
      join: vi.fn(), leave: vi.fn(), announce: vi.fn(), discover: vi.fn(),
      onData: vi.fn(() => vi.fn()), onPeerJoin: vi.fn(() => vi.fn()),
      onPeerLeave: vi.fn(() => vi.fn()), leaveAll: vi.fn().mockResolvedValue(undefined),
      getRoomIds: vi.fn(() => []), getPeerCount: vi.fn(() => 0),
    };
    await DiscoveryStrategyRegistry.set(custom);
    expect(DiscoveryStrategyRegistry.get()).toBe(custom);
  });

  it('set() calls leaveAll on the old strategy before switching', async () => {
    const first = DiscoveryStrategyRegistry.get(); // WebTorrentStrategy
    const second: DiscoveryStrategy = {
      join: vi.fn(), leave: vi.fn(), announce: vi.fn(), discover: vi.fn(),
      onData: vi.fn(() => vi.fn()), onPeerJoin: vi.fn(() => vi.fn()),
      onPeerLeave: vi.fn(() => vi.fn()), leaveAll: vi.fn().mockResolvedValue(undefined),
      getRoomIds: vi.fn(() => []), getPeerCount: vi.fn(() => 0),
    };
    await DiscoveryStrategyRegistry.set(second);
    // The first strategy's leaveAll (WebTorrentStrategy -> transport.leaveAll) was called
    expect(mockTransport.leaveAll).toHaveBeenCalled();
    void first;
  });

  it('reset() causes get() to return a fresh WebTorrentStrategy', () => {
    const first = DiscoveryStrategyRegistry.get();
    DiscoveryStrategyRegistry.reset();
    const second = DiscoveryStrategyRegistry.get();
    expect(second).not.toBe(first);
    expect(second).toBeInstanceOf(WebTorrentStrategy);
  });
});

// ─── Interface contract ───────────────────────────────────────────────────────

describe('DiscoveryStrategy interface contract', () => {
  it('WebTorrentStrategy satisfies all interface methods', () => {
    const strategy = new WebTorrentStrategy(mockTransport as never);
    const methods: Array<keyof DiscoveryStrategy> = [
      'join', 'leave', 'announce', 'discover',
      'onData', 'onPeerJoin', 'onPeerLeave', 'leaveAll', 'getRoomIds', 'getPeerCount',
    ];
    for (const method of methods) {
      expect(typeof strategy[method]).toBe('function');
    }
  });
});

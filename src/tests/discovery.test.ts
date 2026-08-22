import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/repositories/db/database';

vi.mock('@/infrastructure/trystero/DiscoveryTransport', () => {
  const peers = {
    getPeerCount: vi.fn().mockReturnValue(0),
    getPeersInRoom: vi.fn().mockReturnValue([]),
    onPeerJoined: vi.fn(),
    onPeerLeft: vi.fn(),
    clear: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false),
    getAllPeers: vi.fn().mockReturnValue([]),
    getPeer: vi.fn().mockReturnValue(undefined),
  };
  const transport = {
    peers,
    joinRoom: vi.fn().mockResolvedValue(undefined),
    leaveRoom: vi.fn().mockResolvedValue(undefined),
    leaveAll: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
    onData: vi.fn().mockReturnValue(() => {}),
    onPeerJoin: vi.fn().mockReturnValue(() => {}),
    onPeerLeave: vi.fn().mockReturnValue(() => {}),
    getRoomIds: vi.fn().mockReturnValue([]),
    isInRoom: vi.fn().mockReturnValue(false),
  };
  return { discoveryTransport: transport, DiscoveryTransport: vi.fn() };
});

vi.mock('@/services/location/LocationService', () => ({
  LocationService: {
    getDiscoveryContext: vi.fn(),
  },
}));

import { DiscoveryService, h3ToRoomId } from '@/services/discovery/DiscoveryService';
import { discoveryTransport } from '@/infrastructure/trystero/DiscoveryTransport';
import { LocationService } from '@/services/location/LocationService';
import { DiscoveryStrategyRegistry } from '@/infrastructure/discovery/DiscoveryStrategyRegistry';
import { gpsToH3, getNearbyCells } from '@/infrastructure/location/h3';

const LONDON = { latitude: 51.5074, longitude: -0.1278 };
const LONDON_H3 = gpsToH3(LONDON.latitude, LONDON.longitude);
const NEARBY = getNearbyCells(LONDON_H3, 1); // 7 cells including origin

beforeEach(async () => {
  await db.discovery.clear();
  vi.clearAllMocks();
  DiscoveryStrategyRegistry.reset();
  vi.mocked(discoveryTransport.peers.getPeerCount).mockReturnValue(0);
  vi.mocked(discoveryTransport.getRoomIds).mockReturnValue([]);
  vi.mocked(discoveryTransport.leaveAll).mockResolvedValue(undefined);
  vi.mocked(LocationService.getDiscoveryContext).mockResolvedValue({
    h3Index: LONDON_H3,
    nearbyCells: NEARBY,
  });
});

// ─── h3ToRoomId ───────────────────────────────────────────────────────────────

describe('h3ToRoomId', () => {
  it('prefixes cell with nabor:h3:', () => {
    expect(h3ToRoomId('abc123')).toBe('nabor:h3:abc123');
  });

  it('produces unique room IDs for different cells', () => {
    const cells = getNearbyCells(LONDON_H3, 1);
    const roomIds = cells.map(h3ToRoomId);
    const unique = new Set(roomIds);
    expect(unique.size).toBe(roomIds.length);
  });
});

// ─── DiscoveryService ─────────────────────────────────────────────────────────

describe('DiscoveryService', () => {
  it('startDiscovery joins a room for each nearby cell', async () => {
    await DiscoveryService.startDiscovery('acc-1');
    // 7 cells (origin + 6 neighbors)
    expect(discoveryTransport.joinRoom).toHaveBeenCalledTimes(NEARBY.length);
  });

  it('startDiscovery joins rooms with correct nabor:h3: prefix', async () => {
    await DiscoveryService.startDiscovery('acc-1');
    const calls = vi.mocked(discoveryTransport.joinRoom).mock.calls.map((c) => c[0]);
    calls.forEach((roomId) => expect(roomId).toMatch(/^nabor:h3:/));
  });

  it('startDiscovery returns active room IDs and peer count', async () => {
    vi.mocked(discoveryTransport.peers.getPeerCount).mockReturnValue(3);
    const ctx = await DiscoveryService.startDiscovery('acc-1');
    expect(ctx.activeRooms).toHaveLength(NEARBY.length);
    expect(ctx.peerCount).toBe(3);
  });

  it('startDiscovery throws when no location is set', async () => {
    vi.mocked(LocationService.getDiscoveryContext).mockResolvedValue(null);
    await expect(DiscoveryService.startDiscovery('acc-1')).rejects.toThrow('Location not set');
  });

  it('stopDiscovery calls leaveAll on the transport', async () => {
    await DiscoveryService.stopDiscovery();
    expect(discoveryTransport.leaveAll).toHaveBeenCalled();
  });

  it('getContext returns current rooms and peer count', () => {
    vi.mocked(discoveryTransport.getRoomIds).mockReturnValue(['nabor:h3:abc', 'nabor:h3:def']);
    vi.mocked(discoveryTransport.peers.getPeerCount).mockReturnValue(5);
    const ctx = DiscoveryService.getContext();
    expect(ctx.activeRooms).toHaveLength(2);
    expect(ctx.peerCount).toBe(5);
  });

  it('recordSeen saves a seen discovery entry', async () => {
    await DiscoveryService.recordSeen('peer-1', LONDON_H3);
    const entry = await db.discovery.get('peer-1');
    expect(entry?.status).toBe('seen');
    expect(entry?.h3Index).toBe(LONDON_H3);
  });

  it('recordLike saves a liked discovery entry', async () => {
    await DiscoveryService.recordLike('peer-2', LONDON_H3);
    const entry = await db.discovery.get('peer-2');
    expect(entry?.status).toBe('liked');
  });

  it('recordPass saves a passed discovery entry', async () => {
    await DiscoveryService.recordPass('peer-3', LONDON_H3);
    const entry = await db.discovery.get('peer-3');
    expect(entry?.status).toBe('passed');
  });

  it('recordLike overwrites a previous seen entry', async () => {
    await DiscoveryService.recordSeen('peer-1', LONDON_H3);
    await DiscoveryService.recordLike('peer-1', LONDON_H3);
    const entry = await db.discovery.get('peer-1');
    expect(entry?.status).toBe('liked');
  });

  it('getLikedPeers returns only liked entries', async () => {
    await DiscoveryService.recordLike('peer-1', LONDON_H3);
    await DiscoveryService.recordPass('peer-2', LONDON_H3);
    const liked = await DiscoveryService.getLikedPeers();
    expect(liked).toHaveLength(1);
    expect(liked[0].peerId).toBe('peer-1');
  });

  it('getPassedPeers returns only passed entries', async () => {
    await DiscoveryService.recordPass('peer-1', LONDON_H3);
    await DiscoveryService.recordLike('peer-2', LONDON_H3);
    const passed = await DiscoveryService.getPassedPeers();
    expect(passed).toHaveLength(1);
    expect(passed[0].peerId).toBe('peer-1');
  });

  it('getSeenPeers returns only seen entries', async () => {
    await DiscoveryService.recordSeen('peer-1', LONDON_H3);
    await DiscoveryService.recordLike('peer-2', LONDON_H3);
    const seen = await DiscoveryService.getSeenPeers();
    expect(seen).toHaveLength(1);
  });

  it('getPeersInCell returns entries for that H3 cell', async () => {
    await DiscoveryService.recordSeen('peer-1', LONDON_H3);
    await DiscoveryService.recordSeen('peer-2', 'other-cell');
    const inCell = await DiscoveryService.getPeersInCell(LONDON_H3);
    expect(inCell).toHaveLength(1);
    expect(inCell[0].peerId).toBe('peer-1');
  });

  it('hasSeenPeer returns false before any record', async () => {
    expect(await DiscoveryService.hasSeenPeer('peer-1')).toBe(false);
  });

  it('hasSeenPeer returns true after any record', async () => {
    await DiscoveryService.recordSeen('peer-1', LONDON_H3);
    expect(await DiscoveryService.hasSeenPeer('peer-1')).toBe(true);
  });
});

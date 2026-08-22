import { describe, it, expect, vi, beforeEach } from 'vitest';

type MockAction = {
  send: ReturnType<typeof vi.fn>;
  onMessage: ((data: unknown, ctx: { peerId: string }) => void) | null;
  onReceiveProgress: null;
};

type MockRoom = {
  onPeerJoin: ((id: string) => void) | null;
  onPeerLeave: ((id: string) => void) | null;
  getPeers: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
  makeAction: ReturnType<typeof vi.fn>;
};

const _rooms = new Map<string, MockRoom>();

function makeMockRoom(): MockRoom {
  return {
    onPeerJoin: null,
    onPeerLeave: null,
    getPeers: vi.fn().mockReturnValue({}),
    leave: vi.fn().mockResolvedValue(undefined),
    makeAction: vi.fn().mockImplementation((): MockAction => ({
      send: vi.fn().mockResolvedValue(undefined),
      onMessage: null,
      onReceiveProgress: null,
    })),
  };
}

vi.mock('@trystero-p2p/torrent', () => ({
  joinRoom: vi.fn(),
  selfId: 'local-peer-id',
}));

import * as trystero from '@trystero-p2p/torrent';
import { RoomManager } from '@/infrastructure/trystero/RoomManager';
import { PeerManager } from '@/infrastructure/trystero/PeerManager';
import { DiscoveryTransport } from '@/infrastructure/trystero/DiscoveryTransport';

function getMockRoom(roomId: string): MockRoom {
  const room = _rooms.get(roomId);
  if (!room) throw new Error(`No mock room for ${roomId}`);
  return room;
}

beforeEach(() => {
  vi.clearAllMocks();
  _rooms.clear();
  vi.mocked(trystero.joinRoom).mockImplementation((_config, roomId) => {
    const room = makeMockRoom();
    _rooms.set(roomId as string, room);
    return room as unknown as ReturnType<typeof trystero.joinRoom>;
  });
});

// ─── PeerManager ─────────────────────────────────────────────────────────────

describe('PeerManager', () => {
  it('tracks a peer when it joins', () => {
    const pm = new PeerManager();
    pm.onPeerJoined('peer-1', 'room-1');
    expect(pm.isConnected('peer-1')).toBe(true);
    expect(pm.getPeer('peer-1')?.roomId).toBe('room-1');
  });

  it('removes a peer when it leaves', () => {
    const pm = new PeerManager();
    pm.onPeerJoined('peer-1', 'room-1');
    pm.onPeerLeft('peer-1');
    expect(pm.isConnected('peer-1')).toBe(false);
  });

  it('getPeersInRoom returns only peers in that room', () => {
    const pm = new PeerManager();
    pm.onPeerJoined('peer-1', 'room-a');
    pm.onPeerJoined('peer-2', 'room-b');
    pm.onPeerJoined('peer-3', 'room-a');
    expect(pm.getPeersInRoom('room-a')).toHaveLength(2);
    expect(pm.getPeersInRoom('room-b')).toHaveLength(1);
  });

  it('getPeerCount returns total connected peers', () => {
    const pm = new PeerManager();
    pm.onPeerJoined('peer-1', 'room-1');
    pm.onPeerJoined('peer-2', 'room-1');
    expect(pm.getPeerCount()).toBe(2);
  });

  it('clear removes all peers', () => {
    const pm = new PeerManager();
    pm.onPeerJoined('peer-1', 'room-1');
    pm.clear();
    expect(pm.getPeerCount()).toBe(0);
  });
});

// ─── RoomManager ─────────────────────────────────────────────────────────────

describe('RoomManager', () => {
  it('joins a room and returns a TrysteroRoom handle', async () => {
    const rm = new RoomManager({ appId: 'test-app' });
    const room = await rm.join('room-1');
    expect(room).toBeDefined();
    expect(trystero.joinRoom).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'test-app' }),
      'room-1',
    );
  });

  it('returns the same room handle if already joined', async () => {
    const rm = new RoomManager({ appId: 'test-app' });
    const r1 = await rm.join('room-1');
    const r2 = await rm.join('room-1');
    expect(r1).toBe(r2);
    expect(trystero.joinRoom).toHaveBeenCalledTimes(1);
  });

  it('isInRoom returns true after joining', async () => {
    const rm = new RoomManager({ appId: 'test-app' });
    await rm.join('room-1');
    expect(rm.isInRoom('room-1')).toBe(true);
  });

  it('isInRoom returns false before joining', () => {
    const rm = new RoomManager({ appId: 'test-app' });
    expect(rm.isInRoom('room-1')).toBe(false);
  });

  it('leave calls room.leave and removes from tracking', async () => {
    const rm = new RoomManager({ appId: 'test-app' });
    await rm.join('room-1');
    await rm.leave('room-1');
    expect(rm.isInRoom('room-1')).toBe(false);
    expect(getMockRoom('room-1').leave).toHaveBeenCalled();
  });

  it('leaveAll leaves all joined rooms', async () => {
    const rm = new RoomManager({ appId: 'test-app' });
    await rm.join('room-1');
    await rm.join('room-2');
    await rm.leaveAll();
    expect(rm.getRoomIds()).toHaveLength(0);
  });

  it('fires onPeerJoin callback when a peer joins', async () => {
    const rm = new RoomManager({ appId: 'test-app' });
    const onJoin = vi.fn();
    await rm.join('room-1', onJoin);
    getMockRoom('room-1').onPeerJoin?.('peer-abc');
    expect(onJoin).toHaveBeenCalledWith('peer-abc');
  });

  it('fires onPeerLeave callback when a peer leaves', async () => {
    const rm = new RoomManager({ appId: 'test-app' });
    const onLeave = vi.fn();
    await rm.join('room-1', undefined, onLeave);
    getMockRoom('room-1').onPeerLeave?.('peer-abc');
    expect(onLeave).toHaveBeenCalledWith('peer-abc');
  });
});

// ─── DiscoveryTransport ───────────────────────────────────────────────────────

describe('DiscoveryTransport', () => {
  it('joinRoom joins a Trystero room', async () => {
    const dt = new DiscoveryTransport();
    await dt.joinRoom('nabor:h3:test-cell');
    expect(trystero.joinRoom).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'nabor-v1' }),
      'nabor:h3:test-cell',
    );
  });

  it('joinRoom is idempotent', async () => {
    const dt = new DiscoveryTransport();
    await dt.joinRoom('room-1');
    await dt.joinRoom('room-1');
    expect(trystero.joinRoom).toHaveBeenCalledTimes(1);
  });

  it('isInRoom returns true after joining', async () => {
    const dt = new DiscoveryTransport();
    await dt.joinRoom('room-1');
    expect(dt.isInRoom('room-1')).toBe(true);
  });

  it('leaveRoom removes the room', async () => {
    const dt = new DiscoveryTransport();
    await dt.joinRoom('room-1');
    await dt.leaveRoom('room-1');
    expect(dt.isInRoom('room-1')).toBe(false);
  });

  it('leaveAll removes all rooms and clears peers', async () => {
    const dt = new DiscoveryTransport();
    await dt.joinRoom('room-1');
    await dt.joinRoom('room-2');
    dt.peers.onPeerJoined('peer-1', 'room-1');
    await dt.leaveAll();
    expect(dt.getRoomIds()).toHaveLength(0);
    expect(dt.peers.getPeerCount()).toBe(0);
  });

  it('peer join wires into PeerManager', async () => {
    const dt = new DiscoveryTransport();
    await dt.joinRoom('room-1');
    getMockRoom('room-1').onPeerJoin?.('peer-xyz');
    expect(dt.peers.isConnected('peer-xyz')).toBe(true);
  });

  it('peer leave wires into PeerManager', async () => {
    const dt = new DiscoveryTransport();
    await dt.joinRoom('room-1');
    getMockRoom('room-1').onPeerJoin?.('peer-xyz');
    getMockRoom('room-1').onPeerLeave?.('peer-xyz');
    expect(dt.peers.isConnected('peer-xyz')).toBe(false);
  });

  it('onData handler receives incoming data with roomId', async () => {
    const dt = new DiscoveryTransport();
    await dt.joinRoom('room-1');

    const received: unknown[] = [];
    dt.onData((data, peerId, roomId) => received.push({ data, peerId, roomId }));

    const action = getMockRoom('room-1').makeAction.mock.results[0].value as MockAction;
    action.onMessage?.({ type: 'HELLO' }, { peerId: 'peer-1' });

    expect(received).toHaveLength(1);
    expect((received[0] as { data: { type: string } }).data).toEqual({ type: 'HELLO' });
    expect((received[0] as { roomId: string }).roomId).toBe('room-1');
  });

  it('onData returns an unsubscribe function', async () => {
    const dt = new DiscoveryTransport();
    await dt.joinRoom('room-1');

    const handler = vi.fn();
    const unsubscribe = dt.onData(handler);
    unsubscribe();

    const action = getMockRoom('room-1').makeAction.mock.results[0].value as MockAction;
    action.onMessage?.({ type: 'HELLO' }, { peerId: 'peer-1' });

    expect(handler).not.toHaveBeenCalled();
  });
});

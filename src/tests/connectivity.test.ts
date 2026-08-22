import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/repositories/db/database';
import { ConnectivityService } from '@/services/connectivity/ConnectivityService';
import type { IceServerConfig } from '@/types/db';

// RTCPeerConnection stub — push each created instance into pcs[]
type IceCandidateHandler = (e: { candidate: RTCIceCandidate | null }) => void;

interface FakePC {
  onicecandidate: IceCandidateHandler | null;
  createDataChannel: ReturnType<typeof vi.fn>;
  createOffer: ReturnType<typeof vi.fn>;
  setLocalDescription: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  fire: (type: string | null) => void;
}

const pcs: FakePC[] = [];

function makeFakePC(): FakePC {
  const pc: FakePC = {
    onicecandidate: null,
    createDataChannel: vi.fn(),
    createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: '' }),
    setLocalDescription: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    fire: (type) => {
      pc.onicecandidate?.({ candidate: type ? ({ type } as unknown as RTCIceCandidate) : null });
    },
  };
  return pc;
}

beforeEach(async () => {
  await db.settings.clear();
  pcs.length = 0;
  // Re-register stub after any mock resets so pcs[] is always populated
  vi.stubGlobal('RTCPeerConnection', vi.fn(() => {
    const pc = makeFakePC();
    pcs.push(pc);
    return pc;
  }));
});

// getIceServers

describe('ConnectivityService.getIceServers', () => {
  it('returns only STUN servers when no TURN configured', async () => {
    const servers = await ConnectivityService.getIceServers();
    expect(servers.length).toBeGreaterThanOrEqual(2);
    expect(servers.every((s) => String(s.urls).startsWith('stun:'))).toBe(true);
  });

  it('appends TURN servers after STUN when configured', async () => {
    const turn: IceServerConfig = { urls: 'turn:turn.example.com:3478', username: 'u', credential: 'p' };
    await ConnectivityService.addTurnServer(turn);
    const servers = await ConnectivityService.getIceServers();
    const last = servers[servers.length - 1];
    expect(last.urls).toBe('turn:turn.example.com:3478');
    expect(last.username).toBe('u');
  });
});

// addTurnServer

describe('ConnectivityService.addTurnServer', () => {
  it('persists a TURN server to settings', async () => {
    await ConnectivityService.addTurnServer({ urls: 'turn:a.example.com:3478' });
    const servers = await ConnectivityService.getIceServers();
    expect(servers.some((s) => s.urls === 'turn:a.example.com:3478')).toBe(true);
  });

  it('is idempotent — does not add duplicate URLs', async () => {
    const turn: IceServerConfig = { urls: 'turn:a.example.com:3478' };
    await ConnectivityService.addTurnServer(turn);
    await ConnectivityService.addTurnServer(turn);
    const servers = await ConnectivityService.getIceServers();
    const count = servers.filter((s) => s.urls === 'turn:a.example.com:3478').length;
    expect(count).toBe(1);
  });

  it('allows multiple distinct TURN servers', async () => {
    await ConnectivityService.addTurnServer({ urls: 'turn:a.example.com:3478' });
    await ConnectivityService.addTurnServer({ urls: 'turn:b.example.com:3478' });
    const servers = await ConnectivityService.getIceServers();
    const turnServers = servers.filter((s) => String(s.urls).startsWith('turn:'));
    expect(turnServers).toHaveLength(2);
  });
});

// clearTurnServers

describe('ConnectivityService.clearTurnServers', () => {
  it('removes all TURN servers, leaving only STUN', async () => {
    await ConnectivityService.addTurnServer({ urls: 'turn:a.example.com:3478' });
    await ConnectivityService.clearTurnServers();
    const servers = await ConnectivityService.getIceServers();
    expect(servers.every((s) => String(s.urls).startsWith('stun:'))).toBe(true);
  });
});

// probe

describe('ConnectivityService.probe', () => {
  async function startProbe() {
    const probePromise = ConnectivityService.probe();
    // getIceServers() is awaited inside probe before constructing RTCPeerConnection;
    // flush enough microtasks for the DB read + Promise chain to complete
    await new Promise((r) => setTimeout(r, 0));
    return { probePromise, pc: pcs[0] };
  }

  it('returns reachable=true and type=srflx when srflx candidate gathered', async () => {
    const { probePromise, pc } = await startProbe();
    pc.fire('srflx');
    pc.fire(null);
    const result = await probePromise;
    expect(result.reachable).toBe(true);
    expect(result.type).toBe('srflx');
    expect(result.turnRequired).toBe(false);
  });

  it('returns reachable=true and type=relay when relay candidate gathered', async () => {
    const { probePromise, pc } = await startProbe();
    pc.fire('relay');
    pc.fire(null);
    const result = await probePromise;
    expect(result.reachable).toBe(true);
    expect(result.type).toBe('relay');
    expect(result.turnRequired).toBe(false);
  });

  it('returns turnRequired=true when only host candidate gathered', async () => {
    const { probePromise, pc } = await startProbe();
    pc.fire('host');
    pc.fire(null);
    const result = await probePromise;
    expect(result.reachable).toBe(true);
    expect(result.type).toBe('host');
    expect(result.turnRequired).toBe(true);
  });

  it('returns reachable=false and type=none when no candidates gathered', async () => {
    const { probePromise, pc } = await startProbe();
    pc.fire(null);
    const result = await probePromise;
    expect(result.reachable).toBe(false);
    expect(result.type).toBe('none');
  });

  it('prefers relay over srflx over host', async () => {
    const { probePromise, pc } = await startProbe();
    pc.fire('host');
    pc.fire('srflx');
    pc.fire('relay');
    pc.fire(null);
    const result = await probePromise;
    expect(result.type).toBe('relay');
  });
});

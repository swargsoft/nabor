import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/repositories/db/database';

// ─── Mock DiscoveryTransport ──────────────────────────────────────────────────

vi.mock('@/infrastructure/trystero/DiscoveryTransport', () => ({
  discoveryTransport: {
    peers: {
      onPeerLeft: vi.fn(),
    },
  },
}));

import { SafetyService } from '@/services/safety/SafetyService';
import { BlockedPeerRepository } from '@/repositories/BlockedPeerRepository';
import { discoveryTransport } from '@/infrastructure/trystero/DiscoveryTransport';

const ACCOUNT_ID = 'acc-local';
const PEER_ID = 'acc-remote';

beforeEach(async () => {
  await db.blockedPeers.clear();
  SafetyService.clearMutes();
  vi.clearAllMocks();
  vi.mocked(discoveryTransport.peers.onPeerLeft).mockImplementation(vi.fn());
});

// ─── blockPeer ────────────────────────────────────────────────────────────────

describe('SafetyService.blockPeer', () => {
  it('persists the blocked peer to DB', async () => {
    await SafetyService.blockPeer(ACCOUNT_ID, PEER_ID);
    const entry = await db.blockedPeers.get(PEER_ID);
    expect(entry).toBeDefined();
    expect(entry!.id).toBe(PEER_ID);
    expect(entry!.accountId).toBe(ACCOUNT_ID);
  });

  it('stores the reason and note when provided', async () => {
    await SafetyService.blockPeer(ACCOUNT_ID, PEER_ID, 'harassment', 'Sent unwanted messages');
    const entry = await db.blockedPeers.get(PEER_ID);
    expect(entry!.reason).toBe('harassment');
    expect(entry!.note).toBe('Sent unwanted messages');
  });

  it('sets blockedAt timestamp', async () => {
    const before = Date.now();
    await SafetyService.blockPeer(ACCOUNT_ID, PEER_ID);
    const entry = await db.blockedPeers.get(PEER_ID);
    expect(entry!.blockedAt).toBeGreaterThanOrEqual(before);
  });

  it('calls disconnectPeer (onPeerLeft) immediately', async () => {
    await SafetyService.blockPeer(ACCOUNT_ID, PEER_ID);
    expect(vi.mocked(discoveryTransport.peers.onPeerLeft)).toHaveBeenCalledWith(PEER_ID);
  });

  it('overwrites an existing block entry', async () => {
    await SafetyService.blockPeer(ACCOUNT_ID, PEER_ID, 'spam');
    await SafetyService.blockPeer(ACCOUNT_ID, PEER_ID, 'fake');
    const entry = await db.blockedPeers.get(PEER_ID);
    expect(entry!.reason).toBe('fake');
    expect(await db.blockedPeers.count()).toBe(1);
  });
});

// ─── unblockPeer ──────────────────────────────────────────────────────────────

describe('SafetyService.unblockPeer', () => {
  it('removes the peer from the blocked list', async () => {
    await SafetyService.blockPeer(ACCOUNT_ID, PEER_ID);
    await SafetyService.unblockPeer(PEER_ID);
    expect(await db.blockedPeers.get(PEER_ID)).toBeUndefined();
  });

  it('is a no-op for a peer that was not blocked', async () => {
    await expect(SafetyService.unblockPeer('unknown-peer')).resolves.toBeUndefined();
  });
});

// ─── isBlocked ────────────────────────────────────────────────────────────────

describe('SafetyService.isBlocked', () => {
  it('returns true for a blocked peer', async () => {
    await SafetyService.blockPeer(ACCOUNT_ID, PEER_ID);
    expect(await SafetyService.isBlocked(PEER_ID)).toBe(true);
  });

  it('returns false for an unblocked peer', async () => {
    expect(await SafetyService.isBlocked(PEER_ID)).toBe(false);
  });

  it('returns false after unblocking', async () => {
    await SafetyService.blockPeer(ACCOUNT_ID, PEER_ID);
    await SafetyService.unblockPeer(PEER_ID);
    expect(await SafetyService.isBlocked(PEER_ID)).toBe(false);
  });
});

// ─── getBlockedPeers ──────────────────────────────────────────────────────────

describe('SafetyService.getBlockedPeers', () => {
  it('returns all blocked peers for the account', async () => {
    await SafetyService.blockPeer(ACCOUNT_ID, 'peer-a');
    await SafetyService.blockPeer(ACCOUNT_ID, 'peer-b');
    const list = await SafetyService.getBlockedPeers(ACCOUNT_ID);
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.id)).toContain('peer-a');
    expect(list.map((p) => p.id)).toContain('peer-b');
  });

  it('returns empty array when no peers are blocked', async () => {
    expect(await SafetyService.getBlockedPeers(ACCOUNT_ID)).toHaveLength(0);
  });

  it('does not return peers blocked by a different account', async () => {
    await SafetyService.blockPeer('other-account', PEER_ID);
    expect(await SafetyService.getBlockedPeers(ACCOUNT_ID)).toHaveLength(0);
  });
});

// ─── reportPeer ───────────────────────────────────────────────────────────────

describe('SafetyService.reportPeer', () => {
  it('blocks the peer with the given reason', async () => {
    await SafetyService.reportPeer(ACCOUNT_ID, PEER_ID, 'inappropriate', 'Offensive content');
    expect(await SafetyService.isBlocked(PEER_ID)).toBe(true);
    const entry = await db.blockedPeers.get(PEER_ID);
    expect(entry!.reason).toBe('inappropriate');
    expect(entry!.note).toBe('Offensive content');
  });

  it('disconnects the peer on report', async () => {
    await SafetyService.reportPeer(ACCOUNT_ID, PEER_ID, 'spam');
    expect(vi.mocked(discoveryTransport.peers.onPeerLeft)).toHaveBeenCalledWith(PEER_ID);
  });
});

// ─── mute / unmute ────────────────────────────────────────────────────────────

describe('SafetyService mute', () => {
  it('isMuted returns false by default', () => {
    expect(SafetyService.isMuted(PEER_ID)).toBe(false);
  });

  it('isMuted returns true after mutePeer', () => {
    SafetyService.mutePeer(PEER_ID);
    expect(SafetyService.isMuted(PEER_ID)).toBe(true);
  });

  it('isMuted returns false after unmutePeer', () => {
    SafetyService.mutePeer(PEER_ID);
    SafetyService.unmutePeer(PEER_ID);
    expect(SafetyService.isMuted(PEER_ID)).toBe(false);
  });

  it('mute does not persist to DB', async () => {
    SafetyService.mutePeer(PEER_ID);
    expect(await db.blockedPeers.get(PEER_ID)).toBeUndefined();
  });

  it('clearMutes removes all muted peers', () => {
    SafetyService.mutePeer('peer-1');
    SafetyService.mutePeer('peer-2');
    SafetyService.clearMutes();
    expect(SafetyService.isMuted('peer-1')).toBe(false);
    expect(SafetyService.isMuted('peer-2')).toBe(false);
  });
});

// ─── disconnectPeer ───────────────────────────────────────────────────────────

describe('SafetyService.disconnectPeer', () => {
  it('calls onPeerLeft on the transport', () => {
    SafetyService.disconnectPeer(PEER_ID);
    expect(vi.mocked(discoveryTransport.peers.onPeerLeft)).toHaveBeenCalledWith(PEER_ID);
  });

  it('does not persist anything to DB', async () => {
    SafetyService.disconnectPeer(PEER_ID);
    expect(await db.blockedPeers.get(PEER_ID)).toBeUndefined();
  });
});

// ─── BlockedPeerRepository ────────────────────────────────────────────────────

describe('BlockedPeerRepository', () => {
  it('save and get round-trip', async () => {
    const entry = { id: PEER_ID, accountId: ACCOUNT_ID, blockedAt: 1000 };
    await BlockedPeerRepository.save(entry);
    const got = await BlockedPeerRepository.get(PEER_ID);
    expect(got).toEqual(entry);
  });

  it('isBlocked returns true after save', async () => {
    await BlockedPeerRepository.save({ id: PEER_ID, accountId: ACCOUNT_ID, blockedAt: 1000 });
    expect(await BlockedPeerRepository.isBlocked(PEER_ID)).toBe(true);
  });

  it('isBlocked returns false for unknown peer', async () => {
    expect(await BlockedPeerRepository.isBlocked('ghost')).toBe(false);
  });

  it('delete removes the entry', async () => {
    await BlockedPeerRepository.save({ id: PEER_ID, accountId: ACCOUNT_ID, blockedAt: 1000 });
    await BlockedPeerRepository.delete(PEER_ID);
    expect(await BlockedPeerRepository.get(PEER_ID)).toBeUndefined();
  });

  it('getAllForAccount returns only entries for that account', async () => {
    await BlockedPeerRepository.save({ id: 'p1', accountId: ACCOUNT_ID, blockedAt: 1 });
    await BlockedPeerRepository.save({ id: 'p2', accountId: 'other', blockedAt: 2 });
    const list = await BlockedPeerRepository.getAllForAccount(ACCOUNT_ID);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('p1');
  });
});

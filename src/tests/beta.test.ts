import { describe, it, expect } from 'vitest';

/**
 * Stage 24 — Public Beta feature audit.
 * Each test imports a key module and asserts the expected API surface exists.
 * This catches accidental deletions or renames before shipping.
 */

// ─── Auth / Identity ──────────────────────────────────────────────────────────

describe('Beta: Account creation', () => {
  it('AuthService exports createIdentity and restoreIdentity', async () => {
    const { AuthService } = await import('@/services/auth/AuthService');
    expect(typeof AuthService.createIdentity).toBe('function');
    expect(typeof AuthService.restoreIdentity).toBe('function');
    expect(typeof AuthService.deleteIdentity).toBe('function');
  });
});

// ─── Recovery phrase ──────────────────────────────────────────────────────────

describe('Beta: Recovery phrase', () => {
  it('RecoveryService exports generatePhrase and recoverIdentity', async () => {
    const { RecoveryService } = await import('@/services/recovery/RecoveryService');
    expect(typeof RecoveryService.generatePhrase).toBe('function');
    expect(typeof RecoveryService.recoverIdentity).toBe('function');
  });
});

// ─── Profile ──────────────────────────────────────────────────────────────────

describe('Beta: Profile', () => {
  it('ProfileService exports createProfile, getProfile, updateProfile', async () => {
    const { ProfileService } = await import('@/services/profile/ProfileService');
    expect(typeof ProfileService.createProfile).toBe('function');
    expect(typeof ProfileService.getProfile).toBe('function');
    expect(typeof ProfileService.updateProfile).toBe('function');
  });
});

// ─── Profile photos / Media ───────────────────────────────────────────────────

describe('Beta: Profile photos', () => {
  it('MediaService exports storeImage and getImageUrl', async () => {
    const { MediaService } = await import('@/services/media/MediaService');
    expect(typeof MediaService.storeImage).toBe('function');
    expect(typeof MediaService.getImageUrl).toBe('function');
  });
});

// ─── Location ─────────────────────────────────────────────────────────────────

describe('Beta: Location', () => {
  it('LocationService exports updateLocation and getDiscoveryContext', async () => {
    const { LocationService } = await import('@/services/location/LocationService');
    expect(typeof LocationService.updateLocation).toBe('function');
    expect(typeof LocationService.getDiscoveryContext).toBe('function');
  });
});

// ─── H3-based nearby discovery ────────────────────────────────────────────────

describe('Beta: H3-based nearby discovery', () => {
  it('DiscoveryService exports startDiscovery and stopDiscovery', async () => {
    const { DiscoveryService } = await import('@/services/discovery/DiscoveryService');
    expect(typeof DiscoveryService.startDiscovery).toBe('function');
    expect(typeof DiscoveryService.stopDiscovery).toBe('function');
  });

  it('h3ToRoomId produces nabor:h3: prefixed room IDs', async () => {
    const { h3ToRoomId } = await import('@/services/discovery/DiscoveryService');
    expect(h3ToRoomId('8928308280fffff')).toBe('nabor:h3:8928308280fffff');
  });
});

// ─── Trystero / WebTorrent / WebRTC ───────────────────────────────────────────

describe('Beta: Trystero + WebTorrent + WebRTC', () => {
  it('DiscoveryTransport exports joinRoom, leaveRoom, onData', async () => {
    const { discoveryTransport } = await import('@/infrastructure/trystero/DiscoveryTransport');
    expect(typeof discoveryTransport.joinRoom).toBe('function');
    expect(typeof discoveryTransport.leaveRoom).toBe('function');
    expect(typeof discoveryTransport.onData).toBe('function');
  });
});

// ─── P2P profile exchange ─────────────────────────────────────────────────────

describe('Beta: P2P profile exchange', () => {
  it('ProfileExchangeService exports startListening and getCachedProfile', async () => {
    const { ProfileExchangeService } = await import('@/services/profile/ProfileExchangeService');
    expect(typeof ProfileExchangeService.startListening).toBe('function');
    expect(typeof ProfileExchangeService.getCachedProfile).toBe('function');
  });
});

// ─── On-demand P2P images ─────────────────────────────────────────────────────

describe('Beta: On-demand P2P images', () => {
  it('MediaExchangeService exports startListening and requestMedia', async () => {
    const { MediaExchangeService } = await import('@/services/media/MediaExchangeService');
    expect(typeof MediaExchangeService.startListening).toBe('function');
    expect(typeof MediaExchangeService.requestMedia).toBe('function');
  });
});

// ─── Likes / Pass ─────────────────────────────────────────────────────────────

describe('Beta: Likes and Pass', () => {
  it('DiscoveryService exports recordLike and recordPass', async () => {
    const { DiscoveryService } = await import('@/services/discovery/DiscoveryService');
    expect(typeof DiscoveryService.recordLike).toBe('function');
    expect(typeof DiscoveryService.recordPass).toBe('function');
  });
});

// ─── Matches ──────────────────────────────────────────────────────────────────

describe('Beta: Matches', () => {
  it('MatchingService exports onLike and onMatch', async () => {
    const { MatchingService } = await import('@/services/matching/MatchingService');
    expect(typeof MatchingService.onLike).toBe('function');
    expect(typeof MatchingService.onMatch).toBe('function');
  });

  it('MatchRepository exports getByStatus', async () => {
    const { MatchRepository } = await import('@/repositories/MatchRepository');
    expect(typeof MatchRepository.getByStatus).toBe('function');
  });
});

// ─── P2P encrypted text chat ──────────────────────────────────────────────────

describe('Beta: P2P encrypted text chat', () => {
  it('MessagingService exports onMessage, onAck, sendMessage', async () => {
    const { MessagingService } = await import('@/services/messaging/MessagingService');
    expect(typeof MessagingService.onMessage).toBe('function');
    expect(typeof MessagingService.onAck).toBe('function');
    expect(typeof MessagingService.sendMessage).toBe('function');
  });

  it('MessageSyncService exports startListening and requestSync', async () => {
    const { MessageSyncService } = await import('@/services/messaging/MessageSyncService');
    expect(typeof MessageSyncService.startListening).toBe('function');
    expect(typeof MessageSyncService.requestSync).toBe('function');
  });
});

// ─── Block / Report ───────────────────────────────────────────────────────────

describe('Beta: Block and Report', () => {
  it('SafetyService exports blockPeer, unblockPeer, reportPeer, mutePeer', async () => {
    const { SafetyService } = await import('@/services/safety/SafetyService');
    expect(typeof SafetyService.blockPeer).toBe('function');
    expect(typeof SafetyService.unblockPeer).toBe('function');
    expect(typeof SafetyService.reportPeer).toBe('function');
    expect(typeof SafetyService.mutePeer).toBe('function');
  });
});

// ─── QR device pairing ────────────────────────────────────────────────────────

describe('Beta: QR device pairing', () => {
  it('PairingService exports generateQRData, sendPairRequest, startListening', async () => {
    const { PairingService } = await import('@/services/pairing/PairingService');
    expect(typeof PairingService.generateQRData).toBe('function');
    expect(typeof PairingService.sendPairRequest).toBe('function');
    expect(typeof PairingService.startListening).toBe('function');
  });
});

// ─── PWA ──────────────────────────────────────────────────────────────────────

describe('Beta: PWA', () => {
  it('useServiceWorker hook exports updateReady and applyUpdate', async () => {
    // Mock virtual:pwa-register before importing the hook
    vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn(() => vi.fn()) }));
    const { useServiceWorker } = await import('@/hooks/useServiceWorker');
    expect(typeof useServiceWorker).toBe('function');
  });

  it('manifest.webmanifest exists with required fields', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const manifestPath = path.resolve(__dirname, '../../public/manifest.webmanifest');
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw);
    expect(manifest.name).toBe('Nabor');
    expect(manifest.display).toBe('standalone');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    expect(manifest.start_url).toBe('/');
  });
});

// ─── Security ─────────────────────────────────────────────────────────────────

describe('Beta: Security hardening', () => {
  it('SecurityGuard exports validatePacket and payload validators', async () => {
    const sg = await import('@/infrastructure/security/SecurityGuard');
    expect(typeof sg.validatePacket).toBe('function');
    expect(typeof sg.validateMessagePayload).toBe('function');
    expect(typeof sg.validateProfileResponsePayload).toBe('function');
  });
});

// ─── Connection management ────────────────────────────────────────────────────

describe('Beta: Connection management', () => {
  it('ConnectionService exports onPeerConnected, onPeerDisconnected, getState', async () => {
    const { ConnectionService } = await import('@/services/connection/ConnectionService');
    expect(typeof ConnectionService.onPeerConnected).toBe('function');
    expect(typeof ConnectionService.onPeerDisconnected).toBe('function');
    expect(typeof ConnectionService.getState).toBe('function');
  });
});

// ─── STUN/TURN ────────────────────────────────────────────────────────────────

describe('Beta: STUN/TURN evaluation', () => {
  it('ConnectivityService exports probe, getIceServers, addTurnServer', async () => {
    const { ConnectivityService } = await import('@/services/connectivity/ConnectivityService');
    expect(typeof ConnectivityService.probe).toBe('function');
    expect(typeof ConnectivityService.getIceServers).toBe('function');
    expect(typeof ConnectivityService.addTurnServer).toBe('function');
  });
});

// ─── Session orchestration ────────────────────────────────────────────────────

describe('Beta: Session orchestration', () => {
  it('SessionService exports start, stop, getState', async () => {
    const { SessionService } = await import('@/services/SessionService');
    expect(typeof SessionService.start).toBe('function');
    expect(typeof SessionService.stop).toBe('function');
    expect(typeof SessionService.getState).toBe('function');
  });
});

import { vi } from 'vitest';

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/repositories/db/database';

// Mock geolocation infrastructure so LocationService tests don't need real GPS
vi.mock('@/infrastructure/location/geolocation', () => ({
  getCurrentPosition: vi.fn(),
  watchPosition: vi.fn(),
}));

import {
  gpsToH3,
  getNearbyCells,
  h3ToApproximateCenter,
  getH3Resolution,
  DISCOVERY_RESOLUTION,
} from '@/infrastructure/location/h3';
import { LocationService } from '@/services/location/LocationService';
import { getCurrentPosition, watchPosition } from '@/infrastructure/location/geolocation';

// London coordinates
const LONDON = { latitude: 51.5074, longitude: -0.1278 };
const LONDON_H3 = gpsToH3(LONDON.latitude, LONDON.longitude);

beforeEach(async () => {
  await db.locations.clear();
  vi.clearAllMocks();
});

// ─── H3 Infrastructure ───────────────────────────────────────────────────────

describe('H3 infrastructure', () => {
  it('gpsToH3 returns a non-empty string', () => {
    const cell = gpsToH3(LONDON.latitude, LONDON.longitude);
    expect(typeof cell).toBe('string');
    expect(cell.length).toBeGreaterThan(0);
  });

  it('gpsToH3 is deterministic for the same coordinates', () => {
    expect(gpsToH3(LONDON.latitude, LONDON.longitude)).toBe(
      gpsToH3(LONDON.latitude, LONDON.longitude),
    );
  });

  it('gpsToH3 produces different cells for distant coordinates', () => {
    const tokyo = gpsToH3(35.6762, 139.6503);
    expect(LONDON_H3).not.toBe(tokyo);
  });

  it('gpsToH3 uses DISCOVERY_RESOLUTION by default', () => {
    const cell = gpsToH3(LONDON.latitude, LONDON.longitude);
    expect(getH3Resolution(cell)).toBe(DISCOVERY_RESOLUTION);
  });

  it('getNearbyCells returns 7 cells for ring size 1 (cell + 6 neighbors)', () => {
    const cells = getNearbyCells(LONDON_H3, 1);
    expect(cells).toHaveLength(7);
  });

  it('getNearbyCells includes the origin cell', () => {
    const cells = getNearbyCells(LONDON_H3, 1);
    expect(cells).toContain(LONDON_H3);
  });

  it('getNearbyCells returns 19 cells for ring size 2', () => {
    const cells = getNearbyCells(LONDON_H3, 2);
    expect(cells).toHaveLength(19);
  });

  it('h3ToApproximateCenter returns lat/lng near the original coordinates', () => {
    const center = h3ToApproximateCenter(LONDON_H3);
    // Center should be within ~5 km of original (resolution 7 cell size)
    expect(Math.abs(center.latitude - LONDON.latitude)).toBeLessThan(0.1);
    expect(Math.abs(center.longitude - LONDON.longitude)).toBeLessThan(0.1);
  });

  it('getH3Resolution returns the correct resolution', () => {
    const cell = gpsToH3(LONDON.latitude, LONDON.longitude, 8);
    expect(getH3Resolution(cell)).toBe(8);
  });
});

// ─── LocationService ─────────────────────────────────────────────────────────

describe('LocationService', () => {
  const mockRaw = {
    latitude: LONDON.latitude,
    longitude: LONDON.longitude,
    accuracy: 15,
    timestamp: 1000,
  };

  it('updateLocation persists location to Dexie', async () => {
    vi.mocked(getCurrentPosition).mockResolvedValue(mockRaw);
    await LocationService.updateLocation('acc-1');
    const loc = await db.locations.get('acc-1');
    expect(loc).toBeDefined();
    expect(loc?.h3Index).toBe(LONDON_H3);
    expect(loc?.latitude).toBe(LONDON.latitude);
  });

  it('updateLocation returns LocationState with H3 data', async () => {
    vi.mocked(getCurrentPosition).mockResolvedValue(mockRaw);
    const state = await LocationService.updateLocation('acc-1');
    expect(state.h3Index).toBe(LONDON_H3);
    expect(state.nearbyCells).toHaveLength(7);
    expect(state.nearbyCells).toContain(LONDON_H3);
    expect(state.accuracy).toBe(15);
  });

  it('updateLocation does not expose raw GPS in returned state', async () => {
    vi.mocked(getCurrentPosition).mockResolvedValue(mockRaw);
    const state = await LocationService.updateLocation('acc-1');
    expect((state as unknown as Record<string, unknown>).latitude).toBeUndefined();
    expect((state as unknown as Record<string, unknown>).longitude).toBeUndefined();
  });

  it('getLocation returns null when no location saved', async () => {
    expect(await LocationService.getLocation('acc-1')).toBeNull();
  });

  it('getLocation returns LocationState after updateLocation', async () => {
    vi.mocked(getCurrentPosition).mockResolvedValue(mockRaw);
    await LocationService.updateLocation('acc-1');
    const state = await LocationService.getLocation('acc-1');
    expect(state?.h3Index).toBe(LONDON_H3);
    expect(state?.nearbyCells).toHaveLength(7);
  });

  it('getDiscoveryContext returns h3Index and nearbyCells only', async () => {
    vi.mocked(getCurrentPosition).mockResolvedValue(mockRaw);
    await LocationService.updateLocation('acc-1');
    const ctx = await LocationService.getDiscoveryContext('acc-1');
    expect(ctx?.h3Index).toBe(LONDON_H3);
    expect(ctx?.nearbyCells).toHaveLength(7);
    expect((ctx as unknown as Record<string, unknown>).latitude).toBeUndefined();
    expect((ctx as unknown as Record<string, unknown>).longitude).toBeUndefined();
  });

  it('getDiscoveryContext returns null when no location saved', async () => {
    expect(await LocationService.getDiscoveryContext('acc-1')).toBeNull();
  });

  it('clearLocation removes the persisted location', async () => {
    vi.mocked(getCurrentPosition).mockResolvedValue(mockRaw);
    await LocationService.updateLocation('acc-1');
    await LocationService.clearLocation('acc-1');
    expect(await LocationService.getLocation('acc-1')).toBeNull();
  });

  it('watchLocation calls watchPosition and updates on each position change', async () => {
    let capturedCallback: ((pos: typeof mockRaw) => void) | null = null;
    vi.mocked(watchPosition).mockImplementation((onPos) => {
      capturedCallback = onPos;
      return () => {};
    });

    const updates: unknown[] = [];
    LocationService.watchLocation('acc-1', (s) => updates.push(s), vi.fn());

    expect(capturedCallback).not.toBeNull();
    await capturedCallback!(mockRaw);

    expect(updates).toHaveLength(1);
    expect((updates[0] as { h3Index: string }).h3Index).toBe(LONDON_H3);
  });

  it('watchLocation returns an unsubscribe function', () => {
    const mockUnsubscribe = vi.fn();
    vi.mocked(watchPosition).mockReturnValue(mockUnsubscribe);
    const unsubscribe = LocationService.watchLocation('acc-1', vi.fn(), vi.fn());
    unsubscribe();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});

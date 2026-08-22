import { getCurrentPosition, watchPosition, type GeolocationOptions } from '@/infrastructure/location/geolocation';
import { gpsToH3, getNearbyCells, h3ToApproximateCenter, DISCOVERY_RESOLUTION } from '@/infrastructure/location/h3';
import { LocationRepository } from '@/repositories/LocationRepository';
import type { Location } from '@/types/db';
import { createLogger } from '@/utils/logger';

const logger = createLogger('LocationService');

export interface LocationState {
  h3Index: string;
  nearbyCells: string[];
  /** Approximate center of the H3 cell — safe to display on map, not exact GPS */
  approximateCenter: { latitude: number; longitude: number };
  accuracy: number;
  updatedAt: number;
}

export const LocationService = {
  /**
   * Requests current position, converts to H3, persists locally.
   * Raw GPS coordinates are stored locally only — never shared with peers.
   */
  async updateLocation(accountId: string, opts?: GeolocationOptions): Promise<LocationState> {
    const raw = await getCurrentPosition(opts);
    const h3Index = gpsToH3(raw.latitude, raw.longitude, DISCOVERY_RESOLUTION);
    const nearbyCells = getNearbyCells(h3Index, 1);
    const approximateCenter = h3ToApproximateCenter(h3Index);
    const now = Date.now();

    const location: Location = {
      id: accountId,
      latitude: raw.latitude,
      longitude: raw.longitude,
      h3Index,
      accuracy: raw.accuracy,
      updatedAt: now,
    };

    await LocationRepository.save(location);
    logger.info('Location updated', { accountId, h3Index });

    return { h3Index, nearbyCells, approximateCenter, accuracy: raw.accuracy, updatedAt: now };
  },

  /**
   * Returns the persisted location state for an account. Null if never set.
   */
  async getLocation(accountId: string): Promise<LocationState | null> {
    const loc = await LocationRepository.get(accountId);
    if (!loc) return null;

    return {
      h3Index: loc.h3Index,
      nearbyCells: getNearbyCells(loc.h3Index, 1),
      approximateCenter: h3ToApproximateCenter(loc.h3Index),
      accuracy: loc.accuracy,
      updatedAt: loc.updatedAt,
    };
  },

  /**
   * Returns only the H3 index and nearby cells — safe to use for P2P discovery room IDs.
   * Never returns raw GPS.
   */
  async getDiscoveryContext(accountId: string): Promise<{ h3Index: string; nearbyCells: string[] } | null> {
    const loc = await LocationRepository.get(accountId);
    if (!loc) return null;
    return {
      h3Index: loc.h3Index,
      nearbyCells: getNearbyCells(loc.h3Index, 1),
    };
  },

  /**
   * Starts watching position changes and updates location on each change.
   * Returns an unsubscribe function.
   */
  watchLocation(
    accountId: string,
    onUpdate: (state: LocationState) => void,
    onError: (err: Error) => void,
    opts?: GeolocationOptions,
  ): () => void {
    return watchPosition(
      async (raw) => {
        const h3Index = gpsToH3(raw.latitude, raw.longitude, DISCOVERY_RESOLUTION);
        const nearbyCells = getNearbyCells(h3Index, 1);
        const approximateCenter = h3ToApproximateCenter(h3Index);
        const now = Date.now();

        const location: Location = {
          id: accountId,
          latitude: raw.latitude,
          longitude: raw.longitude,
          h3Index,
          accuracy: raw.accuracy,
          updatedAt: now,
        };

        await LocationRepository.save(location);
        logger.info('Location watch update', { accountId, h3Index });
        onUpdate({ h3Index, nearbyCells, approximateCenter, accuracy: raw.accuracy, updatedAt: now });
      },
      onError,
      opts,
    );
  },

  async clearLocation(accountId: string): Promise<void> {
    await LocationRepository.delete(accountId);
    logger.info('Location cleared', { accountId });
  },
};

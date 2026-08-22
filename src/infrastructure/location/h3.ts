import { latLngToCell, gridDisk, cellToLatLng, getResolution } from 'h3-js';

/**
 * Resolution 7 ≈ 5.16 km² average area — good balance for local discovery.
 * Resolution 8 ≈ 0.74 km² — more precise, used for tighter areas.
 */
export const DISCOVERY_RESOLUTION = 7;

/**
 * Converts GPS coordinates to an H3 cell index at the discovery resolution.
 */
export function gpsToH3(latitude: number, longitude: number, resolution = DISCOVERY_RESOLUTION): string {
  return latLngToCell(latitude, longitude, resolution);
}

/**
 * Returns the given cell plus all cells within k rings (neighbors).
 * k=1 returns the cell + 6 immediate neighbors (7 total).
 */
export function getNearbyCells(h3Index: string, ringSize = 1): string[] {
  return gridDisk(h3Index, ringSize);
}

/**
 * Returns the center lat/lng of an H3 cell.
 * Used for approximate display — never for exact user location.
 */
export function h3ToApproximateCenter(h3Index: string): { latitude: number; longitude: number } {
  const [latitude, longitude] = cellToLatLng(h3Index);
  return { latitude, longitude };
}

/**
 * Returns the resolution of an H3 index.
 */
export function getH3Resolution(h3Index: string): number {
  return getResolution(h3Index);
}

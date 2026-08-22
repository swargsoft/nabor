import L from 'leaflet';
import { cellToBoundary } from 'h3-js';

export const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Creates and mounts a Leaflet map into the given container element.
 */
export function createMap(container: HTMLElement, center: L.LatLngExpression, zoom = 11): L.Map {
  const map = L.map(container, { zoomControl: true, attributionControl: true });
  L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map);
  map.setView(center, zoom);
  return map;
}

/**
 * Renders an H3 cell as a polygon on the map.
 * Returns the polygon layer so the caller can remove it later.
 */
export function renderH3Cell(
  map: L.Map,
  h3Index: string,
  options: L.PathOptions = {},
): L.Polygon {
  const boundary = cellToBoundary(h3Index); // [[lat, lng], ...]
  const latLngs = boundary.map(([lat, lng]) => L.latLng(lat, lng));
  const polygon = L.polygon(latLngs, {
    color: '#e91e8c',
    fillColor: '#e91e8c',
    fillOpacity: 0.15,
    weight: 2,
    ...options,
  });
  polygon.addTo(map);
  return polygon;
}

/**
 * Renders multiple H3 cells (e.g. neighbor cells) with a lighter style.
 */
export function renderNearbyCells(
  map: L.Map,
  h3Indexes: string[],
  options: L.PathOptions = {},
): L.Polygon[] {
  return h3Indexes.map((idx) =>
    renderH3Cell(map, idx, {
      color: '#7c4dff',
      fillColor: '#7c4dff',
      fillOpacity: 0.07,
      weight: 1,
      ...options,
    }),
  );
}

/**
 * Removes all provided layers from the map.
 */
export function clearLayers(map: L.Map, layers: L.Layer[]): void {
  layers.forEach((layer) => map.removeLayer(layer));
}

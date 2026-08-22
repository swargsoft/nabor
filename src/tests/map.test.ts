import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('leaflet', () => {
  const mockPolygon = { addTo: vi.fn().mockReturnThis(), remove: vi.fn() };
  const mockTileLayer = { addTo: vi.fn().mockReturnThis() };
  const mockMap = { setView: vi.fn().mockReturnThis(), removeLayer: vi.fn(), remove: vi.fn() };
  return {
    default: {
      map: vi.fn().mockReturnValue(mockMap),
      tileLayer: vi.fn().mockReturnValue(mockTileLayer),
      polygon: vi.fn().mockReturnValue(mockPolygon),
      latLng: vi.fn().mockReturnValue({ lat: 0, lng: 0 }),
    },
  };
});

vi.mock('leaflet/dist/leaflet.css', () => ({}));

import L from 'leaflet';
import {
  createMap,
  renderH3Cell,
  renderNearbyCells,
  clearLayers,
  OSM_TILE_URL,
  OSM_ATTRIBUTION,
} from '@/infrastructure/maps/leafletMap';
import { gpsToH3, getNearbyCells, h3ToApproximateCenter } from '@/infrastructure/location/h3';

const LONDON = { latitude: 51.5074, longitude: -0.1278 };
const LONDON_H3 = gpsToH3(LONDON.latitude, LONDON.longitude);

beforeEach(() => {
  vi.clearAllMocks();
  const polygon = { addTo: vi.fn().mockReturnThis(), remove: vi.fn() };
  const tileLayer = { addTo: vi.fn().mockReturnThis() };
  const map = { setView: vi.fn().mockReturnThis(), removeLayer: vi.fn(), remove: vi.fn() };
  vi.mocked(L.map).mockReturnValue(map as unknown as L.Map);
  vi.mocked(L.tileLayer).mockReturnValue(tileLayer as unknown as L.TileLayer);
  vi.mocked(L.polygon).mockReturnValue(polygon as unknown as L.Polygon);
  vi.mocked(L.latLng).mockReturnValue({ lat: 0, lng: 0 } as unknown as L.LatLng);
});

function getMapMock() {
  return vi.mocked(L.map).mock.results[0]?.value as {
    setView: ReturnType<typeof vi.fn>;
    removeLayer: ReturnType<typeof vi.fn>;
  };
}

function getPolygonMock() {
  return vi.mocked(L.polygon).mock.results[0]?.value as {
    addTo: ReturnType<typeof vi.fn>;
  };
}

// ─── Map infrastructure ───────────────────────────────────────────────────────

describe('leafletMap infrastructure', () => {
  it('createMap calls L.map with the container element', () => {
    const container = document.createElement('div');
    createMap(container, [LONDON.latitude, LONDON.longitude]);
    expect(L.map).toHaveBeenCalledWith(container, expect.any(Object));
  });

  it('createMap adds an OSM tile layer', () => {
    const container = document.createElement('div');
    createMap(container, [LONDON.latitude, LONDON.longitude]);
    expect(L.tileLayer).toHaveBeenCalledWith(
      OSM_TILE_URL,
      expect.objectContaining({ attribution: OSM_ATTRIBUTION }),
    );
    const tileLayer = vi.mocked(L.tileLayer).mock.results[0].value as {
      addTo: ReturnType<typeof vi.fn>;
    };
    expect(tileLayer.addTo).toHaveBeenCalled();
  });

  it('createMap sets the view to the given center and zoom', () => {
    const container = document.createElement('div');
    createMap(container, [LONDON.latitude, LONDON.longitude], 13);
    expect(getMapMock().setView).toHaveBeenCalledWith([LONDON.latitude, LONDON.longitude], 13);
  });

  it('renderH3Cell creates a polygon and adds it to the map', () => {
    const container = document.createElement('div');
    const map = createMap(container, [LONDON.latitude, LONDON.longitude]);
    renderH3Cell(map, LONDON_H3);
    expect(L.polygon).toHaveBeenCalled();
    expect(getPolygonMock().addTo).toHaveBeenCalledWith(map);
  });

  it('renderH3Cell uses primary brand color by default', () => {
    const container = document.createElement('div');
    const map = createMap(container, [LONDON.latitude, LONDON.longitude]);
    renderH3Cell(map, LONDON_H3);
    const opts = vi.mocked(L.polygon).mock.calls[0][1];
    expect(opts?.color).toBe('#e91e8c');
  });

  it('renderH3Cell accepts custom path options', () => {
    const container = document.createElement('div');
    const map = createMap(container, [LONDON.latitude, LONDON.longitude]);
    renderH3Cell(map, LONDON_H3, { color: '#ff0000' });
    const opts = vi.mocked(L.polygon).mock.calls[0][1];
    expect(opts?.color).toBe('#ff0000');
  });

  it('renderNearbyCells renders one polygon per cell', () => {
    const container = document.createElement('div');
    const map = createMap(container, [LONDON.latitude, LONDON.longitude]);
    const cells = getNearbyCells(LONDON_H3, 1);
    renderNearbyCells(map, cells);
    expect(L.polygon).toHaveBeenCalledTimes(cells.length);
  });

  it('clearLayers calls removeLayer for each layer', () => {
    const container = document.createElement('div');
    const map = createMap(container, [LONDON.latitude, LONDON.longitude]);
    clearLayers(map, [{} as L.Layer, {} as L.Layer]);
    expect(getMapMock().removeLayer).toHaveBeenCalledTimes(2);
  });
});

// ─── Location privacy ─────────────────────────────────────────────────────────

describe('map location privacy', () => {
  it('h3ToApproximateCenter does not return exact GPS coordinates', () => {
    const center = h3ToApproximateCenter(LONDON_H3);
    expect(center.latitude).not.toBe(LONDON.latitude);
    expect(center.longitude).not.toBe(LONDON.longitude);
  });

  it('neighbor cells are H3 index strings, not raw coordinates', () => {
    const cells = getNearbyCells(LONDON_H3, 1);
    cells.forEach((cell) => {
      expect(typeof cell).toBe('string');
      expect(cell).not.toContain(String(LONDON.latitude));
    });
  });
});

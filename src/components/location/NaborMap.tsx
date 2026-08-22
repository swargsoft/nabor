import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import type L from 'leaflet';
import {
  createMap,
  renderH3Cell,
  renderNearbyCells,
  clearLayers,
} from '@/infrastructure/maps/leafletMap';
import type { LocationState } from '@/services/location/LocationService';

// Leaflet requires its CSS to be loaded
import 'leaflet/dist/leaflet.css';

interface NaborMapProps {
  locationState: LocationState;
  height?: number | string;
  showNeighbors?: boolean;
}

export function NaborMap({ locationState, height = 300, showNeighbors = true }: NaborMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center = locationState.approximateCenter;
    mapRef.current = createMap(containerRef.current, [center.latitude, center.longitude]);
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update cells when locationState changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous layers
    clearLayers(map, layersRef.current);
    layersRef.current = [];

    const { h3Index, nearbyCells, approximateCenter } = locationState;

    // Pan to new approximate center
    map.setView([approximateCenter.latitude, approximateCenter.longitude], 11);

    // Render neighbor cells first (underneath)
    if (showNeighbors) {
      const neighborCells = nearbyCells.filter((c) => c !== h3Index);
      const neighborLayers = renderNearbyCells(map, neighborCells);
      layersRef.current.push(...neighborLayers);
    }

    // Render the user's own cell on top
    const ownCell = renderH3Cell(map, h3Index);
    layersRef.current.push(ownCell);
  }, [locationState, showNeighbors]);

  return (
    <Box
      ref={containerRef}
      sx={{
        height,
        width: '100%',
        borderRadius: 2,
        overflow: 'hidden',
        '& .leaflet-container': { height: '100%', width: '100%', borderRadius: 'inherit' },
      }}
    />
  );
}

import { useState } from 'react';
import type { LocationState } from '@/services/location/LocationService';

export function useMap() {
  const [mapVisible, setMapVisible] = useState(false);
  const [mapLocation, setMapLocation] = useState<LocationState | null>(null);

  const showMap = (locationState: LocationState) => {
    setMapLocation(locationState);
    setMapVisible(true);
  };

  const hideMap = () => setMapVisible(false);

  return { mapVisible, mapLocation, showMap, hideMap };
}

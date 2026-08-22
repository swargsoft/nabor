import { useCallback, useEffect, useState } from 'react';
import { LocationService, type LocationState } from '@/services/location/LocationService';

type LocationStatus = 'idle' | 'loading' | 'granted' | 'denied' | 'unavailable';

export function useLocation(accountId: string | undefined) {
  const [locationState, setLocationState] = useState<LocationState | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');

  // Restore persisted location on mount
  useEffect(() => {
    if (!accountId) return;
    LocationService.getLocation(accountId).then((loc) => {
      if (loc) setLocationState(loc);
    });
  }, [accountId]);

  const requestLocation = useCallback(async () => {
    if (!accountId) return;
    setStatus('loading');
    try {
      const state = await LocationService.updateLocation(accountId);
      setLocationState(state);
      setStatus('granted');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setStatus(msg.toLowerCase().includes('denied') ? 'denied' : 'unavailable');
    }
  }, [accountId]);

  const clearLocation = useCallback(async () => {
    if (!accountId) return;
    await LocationService.clearLocation(accountId);
    setLocationState(null);
    setStatus('idle');
  }, [accountId]);

  return { locationState, status, requestLocation, clearLocation };
}

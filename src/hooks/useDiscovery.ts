import { useCallback, useEffect, useState } from 'react';
import { DiscoveryService, type DiscoveryContext } from '@/services/discovery/DiscoveryService';

type DiscoveryStatus = 'idle' | 'active' | 'error';

export function useDiscovery(accountId: string | undefined) {
  const [status, setStatus] = useState<DiscoveryStatus>('idle');
  const [context, setContext] = useState<DiscoveryContext>({ activeRooms: [], peerCount: 0 });
  const [error, setError] = useState<string | null>(null);

  // Refresh peer count periodically while active
  useEffect(() => {
    if (status !== 'active') return;
    const interval = setInterval(() => {
      setContext(DiscoveryService.getContext());
    }, 5_000);
    return () => clearInterval(interval);
  }, [status]);

  const startDiscovery = useCallback(async () => {
    if (!accountId) return;
    setError(null);
    try {
      const ctx = await DiscoveryService.startDiscovery(accountId);
      setContext(ctx);
      setStatus('active');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed');
      setStatus('error');
    }
  }, [accountId]);

  const stopDiscovery = useCallback(async () => {
    await DiscoveryService.stopDiscovery();
    setContext({ activeRooms: [], peerCount: 0 });
    setStatus('idle');
  }, []);

  return { status, context, error, startDiscovery, stopDiscovery };
}

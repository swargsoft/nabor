import { useEffect, useState, useCallback } from 'react';
import { AuthService, type FullIdentity } from '@/services/auth/AuthService';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

export function useIdentity() {
  const [status, setStatus] = useState<Status>('loading');
  const [identity, setIdentity] = useState<FullIdentity | null>(null);

  useEffect(() => {
    AuthService.restoreIdentity().then((result) => {
      setIdentity(result);
      setStatus(result ? 'authenticated' : 'unauthenticated');
    });
  }, []);

  const createIdentity = useCallback(async (deviceName?: string) => {
    const result = await AuthService.createIdentity(deviceName);
    setIdentity(result);
    setStatus('authenticated');
    return result;
  }, []);

  const deleteIdentity = useCallback(async () => {
    await AuthService.deleteIdentity();
    setIdentity(null);
    setStatus('unauthenticated');
  }, []);

  return { status, identity, createIdentity, deleteIdentity };
}

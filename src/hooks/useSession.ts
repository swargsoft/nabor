import { useCallback, useEffect, useState } from 'react';
import { SessionService, type SessionState } from '@/services/SessionService';
import type { Identity, Device, Profile } from '@/types/db';

export function useSession() {
  const [state, setState] = useState<SessionState>(SessionService.getState());

  // Sync state from service on mount and keep in sync
  useEffect(() => {
    const sync = () => {
      SessionService.refreshPeerCount();
      setState(SessionService.getState());
    };
    sync();
    const timer = window.setInterval(sync, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const start = useCallback(async (identity: Identity, device: Device, profile?: Profile) => {
    try {
      const next = await SessionService.start(identity, device, profile);
      setState(next);
    } catch {
      setState(SessionService.getState());
    }
  }, []);

  const stop = useCallback(async () => {
    await SessionService.stop();
    setState(SessionService.getState());
  }, []);

  const refresh = useCallback(() => {
    SessionService.refreshPeerCount();
    setState(SessionService.getState());
  }, []);

  const likePeer = useCallback(async (peerId: string, h3Index: string) => {
    await SessionService.likePeer(peerId, h3Index);
    setState(SessionService.getState());
  }, []);

  const passPeer = useCallback(async (peerId: string, h3Index: string) => {
    await SessionService.passPeer(peerId, h3Index);
    setState(SessionService.getState());
  }, []);

  return {
    status: state.status,
    accountId: state.accountId,
    activeRooms: state.activeRooms,
    peerCount: state.peerCount,
    error: state.error,
    start,
    stop,
    refresh,
    likePeer,
    passPeer,
  };
}

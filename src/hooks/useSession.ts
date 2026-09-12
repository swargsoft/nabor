import { useCallback, useEffect, useState } from 'react';
import { SessionService, type SessionState } from '@/services/SessionService';
import type { Identity, Device, Profile } from '@/types/db';

/**
 * React facade for the singleton SessionService.
 *
 * The important bit here is that SessionService owns the live P2P state, while
 * React owns a snapshot of that state. Polling the singleton keeps the UI in
 * sync when peers join/leave after the session has already started.
 */
export function useSession() {
  const [state, setState] = useState<SessionState>(SessionService.getState());

  useEffect(() => {
    const sync = () => setState(SessionService.getState());

    // Sync immediately, then keep the Discover screen live.
    sync();
    const interval = window.setInterval(sync, 1_000);

    return () => window.clearInterval(interval);
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

  return {
    status: state.status,
    accountId: state.accountId,
    activeRooms: state.activeRooms,
    peerCount: state.peerCount,
    error: state.error,
    start,
    stop,
    refresh,
  };
}

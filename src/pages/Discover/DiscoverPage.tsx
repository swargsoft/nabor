import { useEffect, useMemo, useState } from 'react';
import { Avatar, Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useIdentity } from '@/hooks/useIdentity';
import { useSession } from '@/hooks/useSession';
import { useLocation } from '@/hooks/useLocation';
import { useNotification } from '@/hooks/useNotification';
import { useProfile } from '@/hooks/useProfile';
import { ProfileExchangeService, type DiscoveredProfile } from '@/services/profile/ProfileExchangeService';

export default function DiscoverPage() {
  const { identity } = useIdentity();
  const accountId = identity?.identity.id;
  const { locationState, status: locationStatus, requestLocation } = useLocation(accountId);
  const { profile } = useProfile(accountId);
  const { status, activeRooms, peerCount, error, start, stop, likePeer, passPeer } = useSession();
  const { notify } = useNotification();
  const [profiles, setProfiles] = useState<DiscoveredProfile[]>([]);
  const [busyPeer, setBusyPeer] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setProfiles(ProfileExchangeService.getCachedProfiles().filter((p) => p.profile.accountId !== accountId));
    refresh();
    return ProfileExchangeService.onChange(refresh);
  }, [accountId]);

  useEffect(() => {
    if (status !== 'active') return;
    const timer = window.setInterval(() => setProfiles(ProfileExchangeService.getCachedProfiles().filter((p) => p.profile.accountId !== accountId)), 1000);
    return () => window.clearInterval(timer);
  }, [status, accountId]);

  const current = useMemo(() => profiles[0], [profiles]);

  const handleStart = async () => {
    if (!identity) return;
    try {
      if (!locationState) await requestLocation();
      await start(identity.identity, identity.device, profile ?? undefined);
    } catch (err) { notify(err instanceof Error ? err.message : 'Could not start discovery', 'error'); }
  };

  const handleAction = async (action: 'like' | 'pass') => {
    if (!current || !locationState) return;
    setBusyPeer(current.peerId);
    try {
      if (action === 'like') await likePeer(current.peerId, locationState.h3Index);
      else await passPeer(current.peerId, locationState.h3Index);
      setProfiles((prev) => prev.filter((p) => p.peerId !== current.peerId));
      if (action === 'like') notify('Like sent', 'success');
    } catch (err) { notify(err instanceof Error ? err.message : 'Action failed', 'error'); }
    finally { setBusyPeer(null); }
  };

  return (
    <Box maxWidth={520} mx="auto" p={3}>
      <Typography variant="h5" fontWeight={700} mb={3}>Discover</Typography>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="body2" color="text.secondary" mb={1}>Location</Typography>
          {locationState ? <Chip label={`H3 cell: ${locationState.h3Index.slice(0, 12)}…`} color="success" size="small" /> : <Chip label="No location set" size="small" />}
        </Box>

        <Box>
          <Typography variant="body2" color="text.secondary" mb={1}>Session</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip label={status === 'active' ? 'Active' : status === 'starting' ? 'Starting…' : status === 'error' ? 'Error' : 'Idle'} color={status === 'active' ? 'primary' : status === 'error' ? 'error' : 'default'} />
            {status === 'active' && <><Chip label={`${activeRooms.length} rooms`} variant="outlined" /><Chip label={`${peerCount} peers`} variant="outlined" color={peerCount ? 'success' : 'default'} /></>}
          </Stack>
        </Box>

        {status !== 'active' ? (
          <Button variant="contained" size="large" onClick={handleStart} disabled={status === 'starting' || locationStatus === 'loading'} startIcon={status === 'starting' || locationStatus === 'loading' ? <CircularProgress size={18} color="inherit" /> : null}>
            {locationState ? 'Start session' : 'Get location & start'}
          </Button>
        ) : current ? (
          <Paper elevation={4} sx={{ p: 3, borderRadius: 4 }}>
            <Stack alignItems="center" spacing={1.5}>
              <Avatar sx={{ width: 96, height: 96, fontSize: 36 }}>{current.profile.displayName.slice(0, 2).toUpperCase()}</Avatar>
              <Typography variant="h5" fontWeight={700}>{current.profile.displayName}, {current.profile.age}</Typography>
              <Typography color="text.secondary">{current.profile.gender}</Typography>
              {current.profile.bio && <Typography textAlign="center">{current.profile.bio}</Typography>}
              {current.profile.interests.length > 0 && <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center">{current.profile.interests.slice(0, 6).map((x) => <Chip key={x} label={x} size="small" />)}</Stack>}
              <Typography variant="caption" color="text.secondary">Connected peer · profile received P2P</Typography>
              <Stack direction="row" spacing={2} width="100%" mt={1}>
                <Button fullWidth variant="outlined" color="inherit" size="large" disabled={busyPeer !== null} onClick={() => handleAction('pass')}>Pass</Button>
                <Button fullWidth variant="contained" size="large" disabled={busyPeer !== null} onClick={() => handleAction('like')}>Like</Button>
              </Stack>
            </Stack>
          </Paper>
        ) : (
          <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
            <Typography variant="h6" fontWeight={600}>Looking for people nearby…</Typography>
            <Typography variant="body2" color="text.secondary" mt={1}>A connected peer should appear here automatically. Keep the session active on both phones.</Typography>
          </Paper>
        )}

        {status === 'active' && <Button variant="outlined" size="large" color="error" onClick={stop}>Stop session</Button>}
        {error && <Typography variant="body2" color="error">{error}</Typography>}
      </Stack>
    </Box>
  );
}

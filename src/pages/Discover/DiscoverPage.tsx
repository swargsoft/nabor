import { Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import { useIdentity } from '@/hooks/useIdentity';
import { useSession } from '@/hooks/useSession';
import { useLocation } from '@/hooks/useLocation';
import { useNotification } from '@/hooks/useNotification';
import { useProfile } from '@/hooks/useProfile';

export default function DiscoverPage() {
  const { identity } = useIdentity();
  const accountId = identity?.identity.id;
  const { locationState, status: locationStatus, requestLocation } = useLocation(accountId);
  const { profile } = useProfile(accountId);
  const { status, activeRooms, peerCount, error, start, stop } = useSession();
  const { notify } = useNotification();

  const handleStart = async () => {
    if (!identity) return;
    if (!locationState) await requestLocation();
    await start(identity.identity, identity.device, profile ?? undefined);
    if (error) notify(error, 'error');
  };

  return (
    <Box maxWidth={480} mx="auto" p={3}>
      <Typography variant="h5" fontWeight={700} mb={3}>
        Discover
      </Typography>

      <Stack spacing={3}>
        <Box>
          <Typography variant="body2" color="text.secondary" mb={1}>
            Location
          </Typography>
          {locationState ? (
            <Chip
              label={`H3 cell: ${locationState.h3Index.slice(0, 12)}…`}
              color="success"
              size="small"
            />
          ) : (
            <Chip label="No location set" color="default" size="small" />
          )}
        </Box>

        <Box>
          <Typography variant="body2" color="text.secondary" mb={1}>
            Session
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip
              label={status === 'active' ? 'Active' : status === 'starting' ? 'Starting…' : status === 'error' ? 'Error' : 'Idle'}
              color={status === 'active' ? 'primary' : status === 'error' ? 'error' : 'default'}
              size="small"
            />
            {status === 'active' && (
              <>
                <Chip label={`${activeRooms.length} rooms`} size="small" variant="outlined" />
                <Chip label={`${peerCount} peers`} size="small" variant="outlined" color={peerCount > 0 ? 'success' : 'default'} />
              </>
            )}
          </Stack>
        </Box>

        {status !== 'active' ? (
          <Button
            variant="contained"
            size="large"
            onClick={handleStart}
            disabled={status === 'starting' || locationStatus === 'loading'}
            startIcon={
              status === 'starting' || locationStatus === 'loading'
                ? <CircularProgress size={18} color="inherit" />
                : null
            }
          >
            {locationState ? 'Start session' : 'Get location & start'}
          </Button>
        ) : (
          <Button variant="outlined" size="large" color="error" onClick={stop}>
            Stop session
          </Button>
        )}

        {status === 'active' && peerCount === 0 && (
          <Typography variant="body2" color="text.secondary">
            Waiting for nearby people… Keep this screen open on both devices.
          </Typography>
        )}

        {error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

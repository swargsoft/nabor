import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import QrCodeIcon from '@mui/icons-material/QrCode';
import CloseIcon from '@mui/icons-material/Close';
import QRCode from 'qrcode';
import { useIdentity } from '@/hooks/useIdentity';
import { useSession } from '@/hooks/useSession';
import { DeviceRepository } from '@/repositories/DeviceRepository';
import { PairingService } from '@/services/pairing/PairingService';
import type { Device } from '@/types/db';

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DevicesPage() {
  const { identity } = useIdentity();
  const { activeRooms } = useSession();
  const accountId = identity?.identity.id;

  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Add-device flow (new device side) ──────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [pairingStatus, setPairingStatus] = useState<'idle' | 'waiting' | 'accepted' | 'rejected' | 'error'>('idle');
  const [pairingError, setPairingError] = useState<string | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  // ── Incoming request flow (old device side) ────────────────────────────────
  const [incomingRequest, setIncomingRequest] = useState<DevicePairRequestPayload | null>(null);
  const pendingAcceptRef = useRef<((accepted: boolean) => void) | null>(null);

  const loadDevices = useCallback(async () => {
    if (!accountId) return;
    const all = await DeviceRepository.getAllForAccount(accountId);
    all.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    setDevices(all);
    setLoading(false);
  }, [accountId]);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  // Listen for incoming pair requests (old device side) while page is open
  useEffect(() => {
    if (!identity || activeRooms.length === 0) return;

    // We don't know the nonce yet — it comes in the request itself.
    // We pass null for expectedNonce and handle nonce matching in the callback.
    const unsub = PairingService.startListening(
      identity.identity.id,
      {} as CryptoKey, // placeholder — real key derived in handler
      (_peerId) => activeRooms.find((r) => r) ?? activeRooms[0],      null, // no expected nonce — we accept any and show UI
      async (payload) => {
        return new Promise<boolean>((resolve) => {
          setIncomingRequest(payload as DevicePairRequestPayload);
          pendingAcceptRef.current = resolve;
        });
      },
    );

    return () => { unsub(); unsubRef.current?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity?.identity.id, activeRooms.join(',')]);

  const handleGenerateQR = async () => {
    if (!accountId || !deviceName.trim() || activeRooms.length === 0) return;
    setPairingStatus('waiting');
    setPairingError(null);

    try {
      const roomId = activeRooms[0];
      const { qrData, privateKey } = await PairingService.generateQRData(
        accountId, deviceName.trim(), roomId,
      );

      const json = JSON.stringify(qrData);
      const dataUrl = await QRCode.toDataURL(json, { width: 280, margin: 2 });
      setQrDataUrl(dataUrl);

      // Start waiting for response
      const result = await PairingService.sendPairRequest(qrData, privateKey, 120_000);
      if (result.accepted) {
        setPairingStatus('accepted');
        await loadDevices();
      } else {
        setPairingStatus('rejected');
      }
    } catch (err) {
      setPairingStatus('error');
      setPairingError(err instanceof Error ? err.message : 'Pairing failed');
    }
  };

  const handleCloseAdd = () => {
    setAddOpen(false);
    setQrDataUrl(null);
    setDeviceName('');
    setPairingStatus('idle');
    setPairingError(null);
    PairingService.clearPending();
  };

  const handleAcceptIncoming = async (accepted: boolean) => {
    pendingAcceptRef.current?.(accepted);
    pendingAcceptRef.current = null;
    setIncomingRequest(null);
    if (accepted) await loadDevices();
  };

  if (loading) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box maxWidth={480} mx="auto" p={3}>
      <Typography variant="h5" fontWeight={700} mb={3}>
        Devices
      </Typography>

      {/* Device list */}
      {devices.length === 0 ? (
        <Typography variant="body2" color="text.secondary" mb={3}>
          No devices registered yet.
        </Typography>
      ) : (
        <List disablePadding sx={{ mb: 3 }}>
          {devices.map((device, i) => (
            <Box key={device.id}>
              <ListItem disablePadding sx={{ py: 1 }}>
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: 'secondary.main' }}>
                    <PhoneAndroidIcon fontSize="small" />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={device.name}
                  secondary={`Last seen ${formatDate(device.lastSeenAt)}`}
                  primaryTypographyProps={{ fontWeight: 600 }}
                />
                {device.id === identity?.device.id && (
                  <Typography variant="caption" color="primary" sx={{ ml: 1 }}>
                    This device
                  </Typography>
                )}
              </ListItem>
              {i < devices.length - 1 && <Divider variant="inset" component="li" />}
            </Box>
          ))}
        </List>
      )}

      <Button
        variant="contained"
        startIcon={<QrCodeIcon />}
        onClick={() => setAddOpen(true)}
        disabled={activeRooms.length === 0}
        fullWidth
      >
        Add new device
      </Button>

      {activeRooms.length === 0 && (
        <Typography variant="caption" color="text.secondary" display="block" mt={1} textAlign="center">
          Start a session on the Discover page first
        </Typography>
      )}

      {/* Add device dialog (new device side) */}
      <Dialog open={addOpen} onClose={handleCloseAdd} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Add new device
          <IconButton size="small" onClick={handleCloseAdd}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={1}>
            {pairingStatus === 'idle' && (
              <>
                <TextField
                  label="Device name"
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  fullWidth
                  size="small"
                  placeholder="e.g. My Laptop"
                />
                <Button
                  variant="contained"
                  onClick={handleGenerateQR}
                  disabled={!deviceName.trim()}
                >
                  Generate QR code
                </Button>
              </>
            )}

            {pairingStatus === 'waiting' && qrDataUrl && (
              <>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  Scan this QR code with your old device
                </Typography>
                <Box display="flex" justifyContent="center">
                  <img src={qrDataUrl} alt="Pairing QR code" style={{ borderRadius: 8 }} />
                </Box>
                <Stack direction="row" alignItems="center" spacing={1} justifyContent="center">
                  <CircularProgress size={16} />
                  <Typography variant="caption" color="text.secondary">
                    Waiting for approval…
                  </Typography>
                </Stack>
              </>
            )}

            {pairingStatus === 'waiting' && !qrDataUrl && (
              <Box display="flex" justifyContent="center" py={2}>
                <CircularProgress />
              </Box>
            )}

            {pairingStatus === 'accepted' && (
              <Alert severity="success">
                Device paired successfully! It will appear in your device list.
              </Alert>
            )}

            {pairingStatus === 'rejected' && (
              <Alert severity="warning">
                Pairing was rejected by the other device.
              </Alert>
            )}

            {pairingStatus === 'error' && (
              <Alert severity="error">{pairingError ?? 'Pairing failed'}</Alert>
            )}
          </Stack>
        </DialogContent>
      </Dialog>

      {/* Incoming pair request dialog (old device side) */}
      <Dialog open={!!incomingRequest} fullWidth maxWidth="xs">
        <DialogTitle>New device wants to pair</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={1}>
            <Typography variant="body2">
              <strong>{incomingRequest?.deviceName ?? 'Unknown device'}</strong> is requesting
              to be added to your account.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Device ID: {incomingRequest?.deviceId?.slice(0, 16)}…
            </Typography>
            <Stack direction="row" spacing={2}>
              <Button
                variant="contained"
                color="primary"
                fullWidth
                onClick={() => handleAcceptIncoming(true)}
              >
                Accept
              </Button>
              <Button
                variant="outlined"
                color="error"
                fullWidth
                onClick={() => handleAcceptIncoming(false)}
              >
                Reject
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

// Local type alias to avoid import cycle in JSX
interface DevicePairRequestPayload {
  deviceId: string;
  devicePublicKey: string;
  deviceName: string;
  nonce: string;
}

import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControlLabel,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useIdentity } from '@/hooks/useIdentity';
import { useNotification } from '@/hooks/useNotification';
import { SettingsRepository } from '@/repositories/SettingsRepository';
import { ConnectivityService } from '@/services/connectivity/ConnectivityService';
import type { Settings } from '@/types/db';

export default function SettingsPage() {
  const { deleteIdentity } = useIdentity();
  const { notify } = useNotification();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [ageRange, setAgeRange] = useState<[number, number]>([18, 99]);
  const [radiusKm, setRadiusKm] = useState(25);
  const [notifications, setNotifications] = useState(true);
  const [turnUrl, setTurnUrl] = useState('');
  const [turnUser, setTurnUser] = useState('');
  const [turnPass, setTurnPass] = useState('');
  const [probing, setProbing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    SettingsRepository.get().then((s) => {
      setSettings(s);
      setAgeRange([s.ageMin, s.ageMax]);
      setRadiusKm(s.radiusKm);
      setNotifications(s.notificationsEnabled);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await SettingsRepository.save({
        ageMin: ageRange[0],
        ageMax: ageRange[1],
        radiusKm,
        notificationsEnabled: notifications,
      });
      notify('Settings saved', 'success');
    } catch {
      notify('Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddTurn = async () => {
    if (!turnUrl.trim()) return notify('Enter a TURN server URL', 'warning');
    await ConnectivityService.addTurnServer({
      urls: turnUrl.trim(),
      username: turnUser.trim() || undefined,
      credential: turnPass.trim() || undefined,
    });
    setTurnUrl('');
    setTurnUser('');
    setTurnPass('');
    notify('TURN server added', 'success');
  };

  const handleClearTurn = async () => {
    await ConnectivityService.clearTurnServers();
    notify('TURN servers cleared', 'info');
  };

  const handleProbe = async () => {
    setProbing(true);
    try {
      const result = await ConnectivityService.probe();
      const msg = result.reachable
        ? `Connected via ${result.type}${result.turnRequired ? ' — TURN recommended' : ''}`
        : 'No connectivity detected';
      notify(msg, result.reachable ? 'success' : 'warning');
    } finally {
      setProbing(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Delete your account and all local data? This cannot be undone.')) return;
    await deleteIdentity();
  };

  if (!settings) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box maxWidth={480} mx="auto" p={3} pb={10}>
      <Typography variant="h5" fontWeight={700} mb={3}>
        Settings
      </Typography>

      <Stack spacing={4}>
        {/* Discovery preferences */}
        <Box>
          <Typography variant="subtitle2" color="text.secondary" mb={2}>
            DISCOVERY
          </Typography>
          <Stack spacing={3}>
            <Box>
              <Typography variant="body2" gutterBottom>
                Age range: {ageRange[0]}–{ageRange[1]}
              </Typography>
              <Slider
                value={ageRange}
                onChange={(_, v) => setAgeRange(v as [number, number])}
                min={18}
                max={99}
                valueLabelDisplay="auto"
              />
            </Box>
            <Box>
              <Typography variant="body2" gutterBottom>
                Radius: {radiusKm} km
              </Typography>
              <Slider
                value={radiusKm}
                onChange={(_, v) => setRadiusKm(v as number)}
                min={1}
                max={100}
                valueLabelDisplay="auto"
              />
            </Box>
          </Stack>
        </Box>

        <Divider />

        {/* Notifications */}
        <Box>
          <Typography variant="subtitle2" color="text.secondary" mb={2}>
            NOTIFICATIONS
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={notifications}
                onChange={(e) => setNotifications(e.target.checked)}
              />
            }
            label="Enable notifications"
          />
        </Box>

        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={18} color="inherit" /> : null}
        >
          {saving ? 'Saving…' : 'Save settings'}
        </Button>

        <Divider />

        {/* STUN/TURN */}
        <Box>
          <Typography variant="subtitle2" color="text.secondary" mb={1}>
            CONNECTIVITY (STUN/TURN)
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" mb={2}>
            By default Nabor uses public STUN servers. Add a TURN server only if you have
            connectivity issues behind restrictive NAT or mobile networks.
          </Typography>
          <Stack spacing={1.5}>
            <TextField
              size="small"
              label="TURN URL"
              placeholder="turn:your-server.com:3478"
              value={turnUrl}
              onChange={(e) => setTurnUrl(e.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="Username (optional)"
              value={turnUser}
              onChange={(e) => setTurnUser(e.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="Credential (optional)"
              type="password"
              value={turnPass}
              onChange={(e) => setTurnPass(e.target.value)}
              fullWidth
            />
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" size="small" onClick={handleAddTurn}>
                Add TURN server
              </Button>
              <Button variant="text" size="small" color="error" onClick={handleClearTurn}>
                Clear TURN
              </Button>
              <Button
                variant="text"
                size="small"
                onClick={handleProbe}
                disabled={probing}
                startIcon={probing ? <CircularProgress size={14} color="inherit" /> : null}
              >
                Test connectivity
              </Button>
            </Stack>
          </Stack>
        </Box>

        <Divider />

        {/* Danger zone */}
        <Box>
          <Typography variant="subtitle2" color="error" mb={2}>
            DANGER ZONE
          </Typography>
          <Button variant="outlined" color="error" size="small" onClick={handleDeleteAccount}>
            Delete account &amp; all data
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}

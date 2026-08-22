import { useState } from 'react';
import { Box, Button, CircularProgress, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useIdentity } from '@/hooks/useIdentity';
import { useNotification } from '@/hooks/useNotification';

export default function CreateAccountPage() {
  const navigate = useNavigate();
  const { createIdentity } = useIdentity();
  const { notify } = useNotification();
  const [deviceName, setDeviceName] = useState('My Device');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      await createIdentity(deviceName.trim() || 'My Device');
      notify('Identity created successfully', 'success');
      navigate('/profile');
    } catch {
      notify('Failed to create identity', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      gap={3}
      p={3}
    >
      <Typography variant="h5" fontWeight={700}>
        Create your account
      </Typography>
      <Typography variant="body2" color="text.secondary" textAlign="center">
        Your identity is generated on this device. No server required.
      </Typography>
      <TextField
        label="Device name"
        value={deviceName}
        onChange={(e) => setDeviceName(e.target.value)}
        fullWidth
        sx={{ maxWidth: 320 }}
      />
      <Button
        variant="contained"
        size="large"
        fullWidth
        sx={{ maxWidth: 320 }}
        onClick={handleCreate}
        disabled={loading}
        startIcon={loading ? <CircularProgress size={18} color="inherit" /> : null}
      >
        {loading ? 'Generating…' : 'Create identity'}
      </Button>
      <Button variant="text" onClick={() => navigate('/')}>
        Back
      </Button>
    </Box>
  );
}

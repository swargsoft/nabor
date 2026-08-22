import { useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  TextField,
  Typography,
  Alert,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { RecoveryService } from '@/services/recovery/RecoveryService';
import { useNotification } from '@/hooks/useNotification';

export default function RecoveryPage() {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const [phrase, setPhrase] = useState('');
  const [deviceName, setDeviceName] = useState('My Device');
  const [loading, setLoading] = useState(false);
  const [phraseError, setPhraseError] = useState('');

  const handleRecover = async () => {
    setPhraseError('');
    if (!RecoveryService.validatePhrase(phrase.trim())) {
      setPhraseError('Invalid recovery phrase. Check your words and try again.');
      return;
    }
    setLoading(true);
    try {
      await RecoveryService.recoverIdentity(phrase.trim(), deviceName.trim() || 'My Device');
      notify('Account recovered successfully', 'success');
      navigate('/profile');
    } catch {
      notify('Recovery failed. Please try again.', 'error');
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
        Recover account
      </Typography>
      <Typography variant="body2" color="text.secondary" textAlign="center" maxWidth={360}>
        Enter your 12 or 24-word recovery phrase to restore your identity on this device.
        Messages, matches, and media are not restored.
      </Typography>
      <TextField
        label="Recovery phrase"
        multiline
        rows={4}
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        fullWidth
        sx={{ maxWidth: 400 }}
        placeholder="word1 word2 word3 …"
        error={!!phraseError}
        helperText={phraseError}
      />
      <TextField
        label="Device name"
        value={deviceName}
        onChange={(e) => setDeviceName(e.target.value)}
        fullWidth
        sx={{ maxWidth: 400 }}
      />
      {phraseError && (
        <Alert severity="error" sx={{ maxWidth: 400, width: '100%' }}>
          {phraseError}
        </Alert>
      )}
      <Button
        variant="contained"
        size="large"
        fullWidth
        sx={{ maxWidth: 400 }}
        onClick={handleRecover}
        disabled={loading || !phrase.trim()}
        startIcon={loading ? <CircularProgress size={18} color="inherit" /> : null}
      >
        {loading ? 'Recovering…' : 'Restore identity'}
      </Button>
      <Button variant="text" onClick={() => navigate('/')}>
        Back
      </Button>
    </Box>
  );
}

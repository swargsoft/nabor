import { useEffect } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useIdentity } from '@/hooks/useIdentity';

export default function WelcomePage() {
  const navigate = useNavigate();
  const { status } = useIdentity();

  useEffect(() => {
    if (status === 'authenticated') navigate('/profile');
  }, [status, navigate]);

  if (status === 'loading') {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

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
      <Typography variant="h3" fontWeight={700} color="primary">
        Nabor
      </Typography>
      <Typography variant="body1" color="text.secondary" textAlign="center">
        Privacy-first local community dating
      </Typography>
      <Button
        variant="contained"
        size="large"
        fullWidth
        sx={{ maxWidth: 320 }}
        onClick={() => navigate('/create-account')}
      >
        Get started
      </Button>
      <Button
        variant="text"
        size="large"
        fullWidth
        sx={{ maxWidth: 320 }}
        onClick={() => navigate('/recovery')}
      >
        Recover account
      </Button>
    </Box>
  );
}

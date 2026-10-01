import { useEffect } from 'react';
import { Box, Button, CircularProgress, Stack, Typography, useTheme } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useIdentity } from '@/hooks/useIdentity';

// Served straight from /public so the welcome screen, index.html and the web
// manifest all share one brand asset (public/nabor-logo.png).
const naborLogo = `${import.meta.env.BASE_URL}nabor-logo.png`;

export default function WelcomePage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const { status } = useIdentity();

  useEffect(() => {
    if (status === 'authenticated') {
      navigate('/profile', { replace: true });
    }
  }, [status, navigate]);

  if (status === 'loading') {
    return (
      <Box
        sx={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'background.default',
        }}
      >
        <CircularProgress size={28} thickness={4} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',

        // Soft atmospheric background.
        '&::before': {
          content: '""',
          position: 'absolute',
          width: 420,
          height: 420,
          borderRadius: '50%',
          top: -180,
          right: -150,
          background: `radial-gradient(
            circle,
            ${theme.palette.primary.main}18 0%,
            transparent 70%
          )`,
          pointerEvents: 'none',
        },

        '&::after': {
          content: '""',
          position: 'absolute',
          width: 360,
          height: 360,
          borderRadius: '50%',
          bottom: -180,
          left: -160,
          background: `radial-gradient(
            circle,
            ${theme.palette.secondary.main}12 0%,
            transparent 70%
          )`,
          pointerEvents: 'none',
        },
      }}
    >
      {/* Main content */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          width: '100%',
          maxWidth: 480,
          mx: 'auto',
          px: { xs: 3, sm: 4 },
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <Stack
          spacing={0}
          alignItems="center"
          textAlign="center"
          sx={{
            transform: { xs: 'translateY(-2vh)', sm: 'translateY(-3vh)' },
          }}
        >
          {/* Logo */}
          <Box
            sx={{
              width: { xs: 112, sm: 128 },
              height: { xs: 112, sm: 128 },
              mb: 3.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Box
              component="img"
              src={naborLogo}
              alt="Nabor"
              draggable={false}
              sx={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                userSelect: 'none',
                // Lift the near-black icon off the near-black background.
                filter: `drop-shadow(0 10px 28px ${theme.palette.primary.main}40)`,
              }}
            />
          </Box>

          {/* Brand */}
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: '2.35rem', sm: '2.7rem' },
              lineHeight: 1.05,
              fontWeight: 800,
              letterSpacing: '-0.045em',
              mb: 1.5,
            }}
          >
            Meet people{' '}
            <Box
              component="span"
              sx={{
                color: 'primary.main',
              }}
            >
              nearby.
            </Box>
          </Typography>

          {/* Description */}
          <Typography
            color="text.secondary"
            sx={{
              maxWidth: 350,
              fontSize: { xs: '1rem', sm: '1.05rem' },
              lineHeight: 1.6,
              mb: 3,
            }}
          >
            Discover genuine connections in your community, built with privacy at the center.
          </Typography>

          {/* Privacy / product promise */}
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{
              mb: 5,
              px: 2,
              py: 1,
              borderRadius: 10,
              bgcolor: 'action.hover',
            }}
          >
            <Box
              component="span"
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                bgcolor: 'success.main',
                flexShrink: 0,
              }}
            />

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                fontWeight: 600,
                letterSpacing: '0.01em',
              }}
            >
              Privacy-first • Community-focused
            </Typography>
          </Stack>

          {/* Actions */}
          <Stack spacing={1.5} width="100%" maxWidth={360}>
            <Button
              variant="contained"
              size="large"
              fullWidth
              onClick={() => navigate('/create-account')}
              sx={{
                minHeight: 54,
                borderRadius: 3,
                textTransform: 'none',
                fontSize: '1rem',
                fontWeight: 700,
                boxShadow: 'none',

                '&:hover': {
                  boxShadow: 'none',
                },
              }}
            >
              Create your profile
            </Button>

            <Button
              variant="text"
              size="large"
              fullWidth
              onClick={() => navigate('/recovery')}
              sx={{
                minHeight: 48,
                borderRadius: 3,
                textTransform: 'none',
                fontSize: '0.95rem',
                fontWeight: 600,
              }}
            >
              I already have an account
            </Button>
          </Stack>
        </Stack>
      </Box>

      {/* Footer */}
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          pb: {
            xs: 'calc(24px + env(safe-area-inset-bottom))',
            sm: 'calc(32px + env(safe-area-inset-bottom))',
          },
          px: 3,
          textAlign: 'center',
        }}
      >
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{
            fontSize: '0.72rem',
            letterSpacing: '0.01em',
          }}
        >
          Connect locally. Share intentionally.
        </Typography>
      </Box>
    </Box>
  );
}

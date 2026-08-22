import { useEffect } from 'react';
import {
  Avatar,
  Box,
  CircularProgress,
  Divider,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useIdentity } from '@/hooks/useIdentity';
import { useMatches } from '@/hooks/useMatches';
import { useSession } from '@/hooks/useSession';

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function MatchesPage() {
  const navigate = useNavigate();
  const { identity } = useIdentity();
  const accountId = identity?.identity.id;
  const { status } = useSession();
  const { entries, loading, reload } = useMatches(accountId);

  // Reload when session becomes active (new matches may arrive)
  useEffect(() => {
    if (status === 'active') reload();
  }, [status, reload]);

  if (loading) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  if (entries.length === 0) {
    return (
      <Box maxWidth={480} mx="auto" p={3}>
        <Typography variant="h5" fontWeight={700} mb={3}>
          Matches
        </Typography>
        <Typography variant="body2" color="text.secondary">
          No matches yet — start a session and discover people nearby.
        </Typography>
      </Box>
    );
  }

  return (
    <Box maxWidth={480} mx="auto" p={3}>
      <Typography variant="h5" fontWeight={700} mb={2}>
        Matches
      </Typography>
      <List disablePadding>
        {entries.map(({ match, conversation, peerProfile }, i) => {
          const name = peerProfile?.displayName ?? match.peerId.slice(0, 8);
          const initials = name.slice(0, 2).toUpperCase();
          return (
            <Box key={match.id}>
              <ListItemButton
                onClick={() => navigate(`/chat/${conversation.id}`)}
                sx={{ borderRadius: 2, px: 1 }}
              >
                <ListItemAvatar>
                  <Avatar sx={{ bgcolor: 'primary.main' }}>{initials}</Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={name}
                  secondary={peerProfile ? `${peerProfile.age} · ${peerProfile.gender}` : 'Tap to chat'}
                  primaryTypographyProps={{ fontWeight: 600 }}
                />
                <Typography variant="caption" color="text.secondary">
                  {formatTime(conversation.lastMessageAt)}
                </Typography>
              </ListItemButton>
              {i < entries.length - 1 && <Divider variant="inset" component="li" />}
            </Box>
          );
        })}
      </List>
    </Box>
  );
}

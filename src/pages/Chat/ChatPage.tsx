import { useEffect, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { useNavigate, useParams } from 'react-router-dom';
import { useIdentity } from '@/hooks/useIdentity';
import { useConversation } from '@/hooks/useConversation';
import { ProfileExchangeService } from '@/services/profile/ProfileExchangeService';
import type { Message, MessageStatus } from '@/types/db';

function StatusIcon({ status }: { status: MessageStatus }) {
  if (status === 'sending') return <DoneIcon sx={{ fontSize: 14, opacity: 0.4 }} />;
  if (status === 'sent') return <DoneIcon sx={{ fontSize: 14, opacity: 0.7 }} />;
  if (status === 'delivered') return <DoneAllIcon sx={{ fontSize: 14, opacity: 0.7 }} />;
  return <DoneAllIcon sx={{ fontSize: 14, color: 'primary.main' }} />;
}

function MessageBubble({
  message,
  isMine,
  onVisible,
}: {
  message: Message;
  isMine: boolean;
  onVisible?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isMine || !onVisible) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { onVisible(); observer.disconnect(); } },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isMine, onVisible]);

  return (
    <Box
      ref={ref}
      display="flex"
      justifyContent={isMine ? 'flex-end' : 'flex-start'}
      mb={0.5}
    >
      <Box
        sx={{
          maxWidth: '72%',
          px: 1.5,
          py: 1,
          borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          bgcolor: isMine ? 'primary.main' : 'background.paper',
          color: isMine ? '#fff' : 'text.primary',
        }}
      >
        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
          {message.text}
        </Typography>
        {isMine && (
          <Box display="flex" justifyContent="flex-end" mt={0.25}>
            <StatusIcon status={message.status} />
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default function ChatPage() {
  const { id: conversationId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { identity } = useIdentity();
  const accountId = identity?.identity.id;
  const { conversation, messages, loading, sending, send, markRead, reload } = useConversation(conversationId);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const peerProfile = conversation
    ? ProfileExchangeService.getCachedProfile(conversation.peerId)
    : null;
  const peerName = peerProfile?.displayName ?? conversation?.peerId.slice(0, 8) ?? '…';

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Poll for new messages while page is open
  useEffect(() => {
    const interval = setInterval(reload, 3_000);
    return () => clearInterval(interval);
  }, [reload]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setText('');
    await send(trimmed);
    await reload();
  };

  if (loading) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box display="flex" flexDirection="column" height="100dvh" maxWidth={480} mx="auto">
      {/* Header */}
      <Box
        display="flex"
        alignItems="center"
        gap={1.5}
        px={1}
        py={1.5}
        sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
      >
        <IconButton onClick={() => navigate('/matches')} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36 }}>
          {peerName.slice(0, 2).toUpperCase()}
        </Avatar>
        <Box>
          <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
            {peerName}
          </Typography>
          {peerProfile && (
            <Typography variant="caption" color="text.secondary">
              {peerProfile.age} · {peerProfile.gender}
            </Typography>
          )}
        </Box>
      </Box>

      {/* Messages */}
      <Box flex={1} overflow="auto" px={2} py={1}>
        {messages.length === 0 && (
          <Typography variant="body2" color="text.secondary" textAlign="center" mt={4}>
            Say hello 👋
          </Typography>
        )}
        <Stack spacing={0}>
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isMine={msg.senderId === accountId}
              onVisible={
                msg.senderId !== accountId && msg.status === 'delivered'
                  ? () => markRead(msg.id)
                  : undefined
              }
            />
          ))}
        </Stack>
        <div ref={bottomRef} />
      </Box>

      {/* Input */}
      <Box
        px={2}
        py={1.5}
        sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}
      >
        <TextField
          fullWidth
          size="small"
          placeholder="Message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          multiline
          maxRows={4}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  onClick={handleSend}
                  disabled={!text.trim() || sending}
                  color="primary"
                  size="small"
                >
                  {sending ? <CircularProgress size={18} /> : <SendIcon />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </Box>
    </Box>
  );
}

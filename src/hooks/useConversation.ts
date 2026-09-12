import { useCallback, useEffect, useRef, useState } from 'react';
import { ConversationRepository } from '@/repositories/ConversationRepository';
import { MessagingService } from '@/services/messaging/MessagingService';
import { SessionService } from '@/services/SessionService';
import { discoveryTransport } from '@/infrastructure/trystero/DiscoveryTransport';
import { ProfileExchangeService } from '@/services/profile/ProfileExchangeService';
import { deriveKeyPairFromSeed } from '@/infrastructure/crypto/webcrypto';
import type { Conversation, Message } from '@/types/db';

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function useConversation(conversationId: string | undefined) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  const reload = useCallback(async () => {
    if (!conversationId) return;
    const msgs = await MessagingService.getMessages(conversationId);
    setMessages(msgs);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) { setLoading(false); return; }
    ConversationRepository.get(conversationId).then((conv) => {
      setConversation(conv ?? null);
      setLoading(false);
    });
    reload();
  }, [conversationId, reload]);

  // Subscribe to incoming messages for this conversation
  useEffect(() => {
    const state = SessionService.getState();
    if (state.status !== 'active') return;

    unsubRef.current = MessagingService.onAck(async () => { await reload(); });
    return () => { unsubRef.current?.(); };
  }, [reload]);

  const send = useCallback(async (text: string) => {
    if (!conversationId || !conversation) return;
    const state = SessionService.getState();
    if (state.status !== 'active' || !state.accountId) return;

    // Derive private key from stored entropy
    const identity = state.accountId;
    // We need the raw identity — get it from the session state indirectly via AuthService
    // The session already has the derived key in use; re-derive here for the send call
    const { IdentityRepository } = await import('@/repositories/IdentityRepository');
    const identityRecord = await IdentityRepository.getFirst();
    if (!identityRecord) return;

    const entropy = base64ToBytes(identityRecord.privateKey);
    const { privateKey } = await deriveKeyPairFromSeed(entropy);

    const targetPeerId = ProfileExchangeService.getPeerIdForAccount(conversation.peerId) ?? conversation.peerId;
    const roomId = discoveryTransport.peers.getPeer(targetPeerId)?.roomId;
    if (!roomId) return;

    setSending(true);
    try {
      const msg = await MessagingService.sendMessage(
        roomId, identity, privateKey, conversationId, targetPeerId, text,
      );
      setMessages((prev) => [...prev.filter((m) => m.id !== msg.id), msg]);
    } finally {
      setSending(false);
    }
  }, [conversationId, conversation]);

  const markRead = useCallback(async (messageId: string) => {
    if (!conversation) return;
    const state = SessionService.getState();
    if (state.status !== 'active' || !state.accountId) return;

    const { IdentityRepository } = await import('@/repositories/IdentityRepository');
    const identityRecord = await IdentityRepository.getFirst();
    if (!identityRecord) return;

    const entropy = base64ToBytes(identityRecord.privateKey);
    const { privateKey } = await deriveKeyPairFromSeed(entropy);
    const targetPeerId = ProfileExchangeService.getPeerIdForAccount(conversation.peerId) ?? conversation.peerId;
    const roomId = discoveryTransport.peers.getPeer(targetPeerId)?.roomId;
    if (!roomId) return;

    await MessagingService.markRead(roomId, state.accountId, privateKey, messageId, targetPeerId);
    await reload();
  }, [conversation, reload]);

  return { conversation, messages, loading, sending, send, markRead, reload };
}

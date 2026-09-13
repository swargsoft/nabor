import { useCallback, useEffect, useRef, useState } from 'react';
import { ConversationRepository } from '@/repositories/ConversationRepository';
import { MessagingService } from '@/services/messaging/MessagingService';
import { SessionService } from '@/services/SessionService';
import { discoveryTransport } from '@/infrastructure/trystero/DiscoveryTransport';
import { ProfileExchangeService } from '@/services/profile/ProfileExchangeService';
import { deriveKeyPairFromSeed } from '@/infrastructure/crypto/webcrypto';
import type { Conversation, Message } from '@/types/db';
import { getConversationId, isCanonicalConversationId } from '@/services/messaging/ConversationId';
import { MessageRepository } from '@/repositories/MessageRepository';

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
  const [effectiveConversationId, setEffectiveConversationId] = useState<string | undefined>(conversationId);
  const unsubRef = useRef<(() => void) | null>(null);

  const reload = useCallback(async () => {
    const id = effectiveConversationId ?? conversationId;
    if (!id) return;
    const msgs = await MessagingService.getMessages(id);
    setMessages(msgs);
  }, [conversationId, effectiveConversationId]);

  useEffect(() => {
    let cancelled = false;

    const resolveConversation = async () => {
      if (!conversationId) {
        setConversation(null);
        setEffectiveConversationId(undefined);
        setLoading(false);
        return;
      }

      const conv = await ConversationRepository.get(conversationId);
      if (!conv) {
        if (!cancelled) {
          setConversation(null);
          setEffectiveConversationId(conversationId);
          setLoading(false);
          setMessages([]);
        }
        return;
      }

      // Older builds used accountA:accountB as the conversation id.
      // Migrate that local conversation to the canonical 32-hex id before
      // sending anything, otherwise strict payload validation rejects it.
      let resolved = conv;
      let resolvedId = conv.id;
      if (!isCanonicalConversationId(conv.id)) {
        const state = SessionService.getState();
        if (state.accountId && conv.peerId && state.accountId !== conv.peerId) {
          const canonicalId = await getConversationId(state.accountId, conv.peerId);
          const canonical = await ConversationRepository.get(canonicalId);

          if (!canonical) {
            const oldMessages = await MessageRepository.getForConversation(conv.id);
            for (const message of oldMessages) {
              await MessageRepository.save({ ...message, conversationId: canonicalId });
            }
            resolved = { ...conv, id: canonicalId };
            await ConversationRepository.save(resolved);
          } else {
            // Merge legacy messages into the canonical conversation before
            // removing the old id, without overwriting messages that already exist.
            const oldMessages = await MessageRepository.getForConversation(conv.id);
            const existingMessages = await MessageRepository.getForConversation(canonicalId);
            const existingIds = new Set(existingMessages.map((m) => m.id));
            for (const message of oldMessages) {
              if (!existingIds.has(message.id)) {
                await MessageRepository.save({ ...message, conversationId: canonicalId });
              }
            }
            resolved = canonical;
          }

          if (conv.id !== canonicalId) {
            await ConversationRepository.delete(conv.id);
            await MessageRepository.deleteForConversation(conv.id);
          }
          resolvedId = canonicalId;
        }
      }

      if (!cancelled) {
        setConversation(resolved);
        setEffectiveConversationId(resolvedId);
        setLoading(false);
        const msgs = await MessagingService.getMessages(resolvedId);
        if (!cancelled) setMessages(msgs);
      }
    };

    void resolveConversation();
    return () => { cancelled = true; };
  }, [conversationId]);

  // Subscribe to incoming messages for this conversation
  useEffect(() => {
    const state = SessionService.getState();
    if (state.status !== 'active') return;

    const unsubMessage = MessagingService.onMessageReceived((message) => {
      if (message.conversationId === effectiveConversationId) void reload();
    });
    const unsubAck = MessagingService.onAck(async () => { await reload(); });
    unsubRef.current = () => { unsubMessage(); unsubAck(); };
    return () => { unsubRef.current?.(); unsubRef.current = null; };
  }, [reload, effectiveConversationId]);

  const send = useCallback(async (text: string) => {
    const id = effectiveConversationId ?? conversationId;
    if (!id || !conversation) return;
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
        roomId, identity, privateKey, id, targetPeerId, text,
      );
      setMessages((prev) => [...prev.filter((m) => m.id !== msg.id), msg]);
    } finally {
      setSending(false);
    }
  }, [conversationId, effectiveConversationId, conversation]);

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

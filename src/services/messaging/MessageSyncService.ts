import { ProtocolService } from '@/services/messaging/ProtocolService';
import { MessageRepository } from '@/repositories/MessageRepository';
import { ConversationRepository } from '@/repositories/ConversationRepository';
import { validateSyncRequestPayload, validateSyncResponsePayload } from '@/infrastructure/security/SecurityGuard';
import { MessageType } from '@/types/protocol';
import type {
  MessageSyncRequestPayload,
  MessageSyncResponsePayload,
  SyncMessage,
} from '@/types/protocol';
import type { Message } from '@/types/db';
import { createLogger } from '@/utils/logger';

const logger = createLogger('MessageSyncService');

export const MessageSyncService = {
  /**
   * Sends a MESSAGE_SYNC_REQUEST to a peer for a specific conversation.
   * Includes the IDs of messages we already have so the peer only sends what's missing.
   */
  async requestSync(
    roomId: string,
    senderId: string,
    privateKey: CryptoKey,
    targetPeerId: string,
    conversationId: string,
  ): Promise<void> {
    const existing = await MessageRepository.getForConversation(conversationId);
    const knownMessageIds = existing.map((m) => m.id);

    const payload: MessageSyncRequestPayload = { conversationId, knownMessageIds };
    await ProtocolService.send(
      roomId, MessageType.MESSAGE_SYNC_REQUEST, payload, senderId, privateKey, targetPeerId,
    );
    logger.info('Sync request sent', { conversationId, knownCount: knownMessageIds.length, to: targetPeerId });
  },

  /**
   * Handles an incoming MESSAGE_SYNC_REQUEST.
   * Responds with messages in the conversation that the requester doesn't have.
   */
  async handleSyncRequest(
    roomId: string,
    accountId: string,
    privateKey: CryptoKey,
    payload: MessageSyncRequestPayload,
    requesterPeerId: string,
  ): Promise<void> {
    const guard = validateSyncRequestPayload(payload);
    if (!guard.valid) {
      logger.warn('Invalid sync request payload', { reason: guard.reason });
      return;
    }

    const all = await MessageRepository.getForConversation(payload.conversationId);
    const knownSet = new Set(payload.knownMessageIds);

    const missing: SyncMessage[] = all
      .filter((m) => !knownSet.has(m.id))
      .map((m) => ({
        messageId: m.id,
        senderId: m.senderId,
        text: m.text,
        createdAt: m.createdAt,
      }));

    const response: MessageSyncResponsePayload = {
      conversationId: payload.conversationId,
      messages: missing,
    };

    await ProtocolService.send(
      roomId, MessageType.MESSAGE_SYNC_RESPONSE, response, accountId, privateKey, requesterPeerId,
    );
    logger.info('Sync response sent', { conversationId: payload.conversationId, missingCount: missing.length, to: requesterPeerId });
  },

  /**
   * Handles an incoming MESSAGE_SYNC_RESPONSE.
   * Saves any messages we don't already have, deduplicating by messageId.
   * Returns the count of newly saved messages.
   */
  async handleSyncResponse(
    payload: MessageSyncResponsePayload,
  ): Promise<number> {
    const guard = validateSyncResponsePayload(payload);
    if (!guard.valid) throw new Error(`Invalid sync response: ${guard.reason}`);

    let saved = 0;
    for (const syncMsg of payload.messages) {
      const existing = await MessageRepository.get(syncMsg.messageId);
      if (existing) continue;

      const message: Message = {
        id: syncMsg.messageId,
        conversationId: payload.conversationId,
        senderId: syncMsg.senderId,
        text: syncMsg.text,
        status: 'delivered',
        createdAt: syncMsg.createdAt,
      };
      await MessageRepository.save(message);
      saved++;
    }

    if (saved > 0) {
      // Touch conversation timestamp to the latest synced message
      const latest = payload.messages.reduce(
        (max, m) => (m.createdAt > max ? m.createdAt : max),
        0,
      );
      const conv = await ConversationRepository.get(payload.conversationId);
      if (conv && latest > conv.lastMessageAt) {
        await ConversationRepository.save({ ...conv, lastMessageAt: latest });
      }
    }

    logger.info('Sync response handled', { conversationId: payload.conversationId, saved });
    return saved;
  },

  /**
   * Starts listening for MESSAGE_SYNC_REQUEST and MESSAGE_SYNC_RESPONSE packets.
   * Returns a combined unsubscribe function.
   */
  startListening(
    accountId: string,
    privateKey: CryptoKey,
    getRoomForPeer: (peerId: string) => string | undefined,
  ): () => void {
    const unsubReq = ProtocolService.onMessage<MessageSyncRequestPayload>(
      MessageType.MESSAGE_SYNC_REQUEST,
      async ({ packet, peerId }) => {
        const roomId = getRoomForPeer(peerId);
        if (!roomId) return;
        await MessageSyncService.handleSyncRequest(
          roomId, accountId, privateKey, packet.payload, peerId,
        );
      },
    );

    const unsubRes = ProtocolService.onMessage<MessageSyncResponsePayload>(
      MessageType.MESSAGE_SYNC_RESPONSE,
      async ({ packet }) => {
        await MessageSyncService.handleSyncResponse(packet.payload);
      },
    );

    return () => { unsubReq(); unsubRes(); };
  },
};

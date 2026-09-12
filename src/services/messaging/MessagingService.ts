import { ProtocolService } from '@/services/messaging/ProtocolService';
import { MessageRepository } from '@/repositories/MessageRepository';
import { ConversationRepository } from '@/repositories/ConversationRepository';
import { generateId } from '@/infrastructure/crypto/webcrypto';
import { validateMessagePayload } from '@/infrastructure/security/SecurityGuard';
import { MessageType } from '@/types/protocol';
import type { MessagePayload, MessageAckPayload } from '@/types/protocol';
import type { Message, MessageStatus } from '@/types/db';
import { createLogger } from '@/utils/logger';

const logger = createLogger('MessagingService');

export const MessagingService = {
  /**
   * Sends a text message to a peer in a conversation.
   * Persists locally as 'sending', sends the packet, then updates to 'sent'.
   */
  async sendMessage(
    roomId: string,
    senderId: string,
    privateKey: CryptoKey,
    conversationId: string,
    targetPeerId: string,
    text: string,
  ): Promise<Message> {
    const messageId = generateId();
    const now = Date.now();

    const message: Message = {
      id: messageId,
      conversationId,
      senderId,
      text,
      status: 'sending',
      createdAt: now,
    };

    await MessageRepository.save(message);

    const payload: MessagePayload = { conversationId, messageId, text };
    await ProtocolService.send(roomId, MessageType.MESSAGE, payload, senderId, privateKey, targetPeerId);

    const sent: Message = { ...message, status: 'sent' };
    await MessageRepository.save(sent);

    await MessagingService._touchConversation(conversationId, now);
    logger.info('Message sent', { messageId, conversationId });
    return sent;
  },

  /**
   * Handles an incoming MESSAGE packet from a peer.
   * Saves to DB and sends a 'delivered' ACK back.
   */
  async handleIncomingMessage(
    roomId: string,
    accountId: string,
    privateKey: CryptoKey,
    payload: MessagePayload,
    fromAccountId: string,
    _transportPeerId?: string,
  ): Promise<Message> {
    const guard = validateMessagePayload(payload);
    if (!guard.valid) throw new Error(`Invalid message payload: ${guard.reason}`);

    const now = Date.now();
    const message: Message = {
      id: payload.messageId,
      conversationId: payload.conversationId,
      senderId: fromAccountId,
      text: payload.text,
      status: 'delivered',
      createdAt: now,
    };

    await MessageRepository.save(message);
    await MessagingService._touchConversation(payload.conversationId, now);

    // Send delivered ACK
    const ack: MessageAckPayload = { messageId: payload.messageId, status: 'delivered' };
    await ProtocolService.send(roomId, MessageType.MESSAGE_ACK, ack, accountId, privateKey, fromPeerId);

    logger.info('Message received', { messageId: payload.messageId });
    return message;
  },

  /**
   * Marks a received message as read and sends a 'read' ACK to the sender.
   */
  async markRead(
    roomId: string,
    accountId: string,
    privateKey: CryptoKey,
    messageId: string,
    targetPeerId: string,
  ): Promise<void> {
    const message = await MessageRepository.get(messageId);
    if (!message) return;

    await MessageRepository.save({ ...message, status: 'read' });

    const ack: MessageAckPayload = { messageId, status: 'read' };
    await ProtocolService.send(roomId, MessageType.MESSAGE_ACK, ack, accountId, privateKey, targetPeerId);
    logger.debug('Read ACK sent', { messageId });
  },

  /**
   * Handles an incoming MESSAGE_ACK — updates the local message status.
   */
  async handleAck(payload: MessageAckPayload): Promise<void> {
    const message = await MessageRepository.get(payload.messageId);
    if (!message) return;
    // Only advance status, never regress (sent → delivered → read)
    const order: MessageStatus[] = ['sending', 'sent', 'delivered', 'read'];
    if (order.indexOf(payload.status) > order.indexOf(message.status)) {
      await MessageRepository.save({ ...message, status: payload.status });
      logger.debug('Message status updated', { messageId: payload.messageId, status: payload.status });
    }
  },

  /**
   * Registers a listener for incoming MESSAGE packets.
   * Returns unsubscribe function.
   */
  onMessage(
    accountId: string,
    privateKey: CryptoKey,
    getRoomForPeer: (peerId: string) => string | undefined,
    handler: (message: Message) => void,
  ): () => void {
    return ProtocolService.onMessage<MessagePayload>(
      MessageType.MESSAGE,
      async ({ packet, peerId }) => {
        const roomId = getRoomForPeer(peerId);
        if (!roomId) return;
        const message = await MessagingService.handleIncomingMessage(
          roomId, accountId, privateKey, packet.payload, packet.senderId, peerId,
        );
        handler(message);
      },
    );
  },

  /**
   * Registers a listener for incoming MESSAGE_ACK packets.
   * Returns unsubscribe function.
   */
  onAck(handler?: (payload: MessageAckPayload) => void): () => void {
    return ProtocolService.onMessage<MessageAckPayload>(
      MessageType.MESSAGE_ACK,
      async ({ packet }) => {
        await MessagingService.handleAck(packet.payload);
        handler?.(packet.payload);
      },
    );
  },

  /**
   * Returns all messages for a conversation, sorted by createdAt ascending.
   */
  async getMessages(conversationId: string): Promise<Message[]> {
    return MessageRepository.getForConversation(conversationId);
  },

  // ─── Internal ──────────────────────────────────────────────────────────────

  async _touchConversation(conversationId: string, timestamp: number): Promise<void> {
    const conv = await ConversationRepository.get(conversationId);
    if (conv) await ConversationRepository.save({ ...conv, lastMessageAt: timestamp });
  },
};

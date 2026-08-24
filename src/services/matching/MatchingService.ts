import { ProtocolService } from '@/services/messaging/ProtocolService';
import { DiscoveryService } from '@/services/discovery/DiscoveryService';
import { MatchRepository } from '@/repositories/MatchRepository';
import { ConversationRepository } from '@/repositories/ConversationRepository';
import { generateId } from '@/infrastructure/crypto/webcrypto';
import { MessageType } from '@/types/protocol';
import type { LikePayload, PassPayload, MatchPayload } from '@/types/protocol';
import type { Match, Conversation } from '@/types/db';
import { createLogger } from '@/utils/logger';

const logger = createLogger('MatchingService');

export interface MatchResult {
  match: Match;
  conversation: Conversation;
}

export const MatchingService = {
  /**
   * Sends a LIKE packet to a peer and records it locally.
   * If the peer has already liked us, creates a mutual Match + Conversation.
   */
  async sendLike(
    roomId: string,
    accountId: string,
    privateKey: CryptoKey,
    targetId: string,
    h3Index: string,
  ): Promise<MatchResult | null> {
    const payload: LikePayload = { targetId };
    await ProtocolService.send(roomId, MessageType.LIKE, payload, accountId, privateKey, targetId);
    await DiscoveryService.recordLike(targetId, h3Index);
    logger.info('LIKE sent', { targetId });

    // Check for mutual like — if target already liked us, it's a match
    const theirLike = await MatchRepository.get(`${targetId}:${accountId}`);
    if (theirLike?.status === 'pending') {
      return MatchingService._createMatch(accountId, targetId, roomId, privateKey);
    }

    // Record our pending like for the other side to detect
    await MatchingService._savePendingLike(accountId, targetId);
    return null;
  },

  /**
   * Sends a PASS packet to a peer and records it locally.
   */
  async sendPass(
    roomId: string,
    accountId: string,
    privateKey: CryptoKey,
    targetId: string,
    h3Index: string,
  ): Promise<void> {
    const payload: PassPayload = { targetId };
    await ProtocolService.send(roomId, MessageType.PASS, payload, accountId, privateKey, targetId);
    await DiscoveryService.recordPass(targetId, h3Index);
    logger.info('PASS sent', { targetId });
  },

  /**
   * Handles an incoming LIKE from a peer.
   * If we have already liked them, creates a mutual Match + Conversation.
   * Otherwise records their pending like.
   */
  async handleIncomingLike(
    roomId: string,
    accountId: string,
    privateKey: CryptoKey,
    fromPeerId: string,
    _h3Index: string,
  ): Promise<MatchResult | null> {
    // Record their like as a pending match entry
    await MatchingService._savePendingLike(fromPeerId, accountId);

    // Check if we already liked them
    const ourLike = await MatchRepository.get(`${accountId}:${fromPeerId}`);
    if (ourLike?.status === 'pending') {
      return MatchingService._createMatch(accountId, fromPeerId, roomId, privateKey);
    }

    logger.info('Incoming LIKE recorded', { fromPeerId });
    return null;
  },

  /**
   * Registers a listener for incoming LIKE packets.
   * Returns unsubscribe function.
   */
  onLike(
    accountId: string,
    privateKey: CryptoKey,
    h3Index: string,
    getRoomForPeer: (peerId: string) => string | undefined,
    onMatch?: (result: MatchResult) => void,
  ): () => void {
    return ProtocolService.onMessage<LikePayload>(
      MessageType.LIKE,
      async ({ packet, peerId }) => {
        if (packet.payload.targetId !== accountId) return;
        const roomId = getRoomForPeer(peerId);
        if (!roomId) return;
        const result = await MatchingService.handleIncomingLike(
          roomId, accountId, privateKey, packet.senderId, h3Index,
        );
        if (result) onMatch?.(result);
      },
    );
  },

  /**
   * Registers a listener for incoming MATCH packets (sent by the other side on mutual like).
   * Returns unsubscribe function.
   */
  onMatch(handler: (payload: MatchPayload, fromPeerId: string) => void): () => void {
    return ProtocolService.onMessage<MatchPayload>(
      MessageType.MATCH,
      ({ packet, peerId }) => handler(packet.payload, peerId),
    );
  },

  // ─── Internal helpers ───────────────────────────────────────────────────────

  async _savePendingLike(fromId: string, toId: string): Promise<void> {
    const match: Match = {
      id: `${fromId}:${toId}`,
      accountId: fromId,
      peerId: toId,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await MatchRepository.save(match);
  },

  async _createMatch(
    accountId: string,
    peerId: string,
    roomId: string,
    privateKey: CryptoKey,
  ): Promise<MatchResult> {
    const now = Date.now();
    const conversationId = generateId();

    const match: Match = {
      id: `${accountId}:${peerId}`,
      accountId,
      peerId,
      status: 'matched',
      createdAt: now,
      updatedAt: now,
    };

    const conversation: Conversation = {
      id: conversationId,
      matchId: match.id,
      peerId,
      lastMessageAt: now,
      createdAt: now,
    };

    await MatchRepository.save(match);
    await ConversationRepository.save(conversation);

    // Notify the peer of the mutual match
    const matchPayload: MatchPayload = { targetId: peerId, conversationId };
    await ProtocolService.send(roomId, MessageType.MATCH, matchPayload, accountId, privateKey, peerId);

    logger.info('Mutual match created', { accountId, peerId, conversationId });
    return { match, conversation };
  },
};

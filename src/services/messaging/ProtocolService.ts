import { discoveryTransport } from '@/infrastructure/trystero/DiscoveryTransport';
import { createPacket, verifyPacket, parsePacket } from '@/infrastructure/trystero/ProtocolCodec';
import { validatePacket } from '@/infrastructure/security/SecurityGuard';
import { BlockedPeerRepository } from '@/repositories/BlockedPeerRepository';
import type { JsonValue } from '@trystero-p2p/core';
import type { Packet, PayloadMap } from '@/types/protocol';
import { MessageType } from '@/types/protocol';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ProtocolService');

export interface IncomingPacket<T = unknown> {
  packet: Packet<T>;
  peerId: string;
  roomId: string;
  verified: boolean;
}

export type PacketHandler<T = unknown> = (incoming: IncomingPacket<T>) => void;

/**
 * Typed peer-to-peer messaging layer over DiscoveryTransport.
 * Handles packet creation, signing, parsing, and optional signature verification.
 */
export const ProtocolService = {
  /**
   * Sends a typed, signed packet to a specific peer or broadcasts to a room.
   */
  async send<K extends MessageType>(
    roomId: string,
    type: K,
    payload: PayloadMap[K],
    senderId: string,
    privateKey: CryptoKey,
    targetPeerId?: string,
  ): Promise<void> {
    const packet = await createPacket(type, senderId, payload, privateKey);
    discoveryTransport.send(roomId, packet as unknown as JsonValue, targetPeerId);
    logger.debug('Packet sent', { type, roomId, targetPeerId });
  },

  /**
   * Registers a handler for all incoming packets of a given message type.
   * Optionally verifies the signature using the sender's public key resolver.
   *
   * @param type - MessageType to filter on, or null to receive all types
   * @param handler - called for each matching packet
   * @param getPublicKey - optional async resolver: senderId → base64 SPKI public key
   * @returns unsubscribe function
   */
  onMessage<T = unknown>(
    type: MessageType | null,
    handler: PacketHandler<T>,
    getPublicKey?: (senderId: string) => Promise<string | null>,
  ): () => void {
    return discoveryTransport.onData(async (raw, peerId, roomId) => {
      const packet = parsePacket<T>(raw);
      if (!packet) return;
      if (type !== null && packet.messageType !== type) return;

      const guard = validatePacket(packet);
      if (!guard.valid) {
        logger.warn('Packet failed security validation', { reason: guard.reason, type: packet.messageType });
        return;
      }

      // Drop packets from blocked peers
      if (await BlockedPeerRepository.isBlocked(packet.senderId)) {
        logger.debug('Packet dropped — sender is blocked', { senderId: packet.senderId });
        return;
      }

      let verified = false;
      if (getPublicKey) {
        const pubKey = await getPublicKey(packet.senderId);
        if (pubKey) {
          verified = await verifyPacket(packet, pubKey);
          if (!verified) {
            logger.warn('Packet signature invalid', { type: packet.messageType, senderId: packet.senderId });
            return;
          }
        }
      }

      handler({ packet, peerId, roomId, verified });
    });
  },
};

import { ProtocolService } from '@/services/messaging/ProtocolService';
import { MessageType } from '@/types/protocol';
import type { HelloPayload, PingPayload, PongPayload } from '@/types/protocol';
import { createLogger } from '@/utils/logger';

const logger = createLogger('HandshakeService');

/** In-memory registry: accountId → base64 SPKI public key */
const peerKeys = new Map<string, string>();

export const HandshakeService = {
  /**
   * Broadcasts a HELLO packet to a room so peers know our identity and public key.
   */
  async broadcastHello(
    roomId: string,
    senderId: string,
    publicKey: string,
    deviceId: string,
    privateKey: CryptoKey,
    displayName?: string,
  ): Promise<void> {
    const payload: HelloPayload = { publicKey, deviceId, displayName };
    await ProtocolService.send(roomId, MessageType.HELLO, payload, senderId, privateKey);
    logger.info('HELLO broadcast', { roomId, senderId });
  },

  /**
   * Sends a PING to a specific peer.
   */
  async sendPing(
    roomId: string,
    senderId: string,
    privateKey: CryptoKey,
    targetPeerId: string,
    nonce: string,
  ): Promise<void> {
    const payload: PingPayload = { nonce };
    await ProtocolService.send(roomId, MessageType.PING, payload, senderId, privateKey, targetPeerId);
  },

  /**
   * Starts listening for HELLO packets — registers the sender's public key.
   * Starts listening for PING packets — responds with PONG.
   * Returns a combined unsubscribe function.
   */
  startListening(
    senderId: string,
    privateKey: CryptoKey,
    getRoomForPeer: (peerId: string) => string | undefined,
  ): () => void {
    const unsubHello = ProtocolService.onMessage<HelloPayload>(
      MessageType.HELLO,
      ({ packet, peerId }) => {
        peerKeys.set(packet.senderId, packet.payload.publicKey);
        logger.info('Peer key registered', { senderId: packet.senderId, peerId });
      },
    );

    const unsubPing = ProtocolService.onMessage<PingPayload>(
      MessageType.PING,
      async ({ packet, peerId }) => {
        const roomId = getRoomForPeer(peerId);
        if (!roomId) return;
        const pong: PongPayload = { nonce: packet.payload.nonce };
        await ProtocolService.send(roomId, MessageType.PONG, pong, senderId, privateKey, peerId);
        logger.debug('PONG sent', { to: peerId, nonce: packet.payload.nonce });
      },
    );

    return () => {
      unsubHello();
      unsubPing();
    };
  },

  /** Returns the registered public key for a peer, or null if unknown. */
  getPeerPublicKey(accountId: string): string | null {
    return peerKeys.get(accountId) ?? null;
  },

  /** Registers a peer's public key manually (e.g. from a PROFILE_RESPONSE). */
  registerPeerKey(accountId: string, publicKey: string): void {
    peerKeys.set(accountId, publicKey);
  },

  /** Clears the in-memory key registry (used in tests / on logout). */
  clearRegistry(): void {
    peerKeys.clear();
  },
};

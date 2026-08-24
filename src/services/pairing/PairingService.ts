import { ProtocolService } from '@/services/messaging/ProtocolService';
import { DeviceRepository } from '@/repositories/DeviceRepository';
import { generateKeyPair, exportPublicKey, generateId } from '@/infrastructure/crypto/webcrypto';
import { MessageType } from '@/types/protocol';
import type { DevicePairRequestPayload, DevicePairResponsePayload } from '@/types/protocol';
import type { Device } from '@/types/db';
import { createLogger } from '@/utils/logger';

const logger = createLogger('PairingService');

/** The data encoded in the QR code — scanned by the old device. */
export interface PairingQRData {
  accountId: string;
  deviceId: string;
  devicePublicKey: string; // base64 SPKI — new device's key
  deviceName: string;
  nonce: string;
  roomId: string;          // discovery room to send the pair request on
}

/** Result returned to the new device after pairing completes. */
export interface PairingResult {
  accepted: boolean;
  deviceId: string;
}

/** In-memory pending pair resolvers: nonce → resolve fn */
const pendingPairs = new Map<string, (result: PairingResult) => void>();

export const PairingService = {
  /**
   * Called on the NEW device.
   * Generates a fresh key pair + nonce, returns the QR payload to display.
   * The caller should encode this as a QR code and show it to the user.
   */
  async generateQRData(
    accountId: string,
    deviceName: string,
    roomId: string,
  ): Promise<{ qrData: PairingQRData; privateKey: CryptoKey }> {
    const keyPair = await generateKeyPair();
    const devicePublicKey = await exportPublicKey(keyPair.publicKey);
    const deviceId = generateId();
    const nonce = generateId();

    const qrData: PairingQRData = {
      accountId,
      deviceId,
      devicePublicKey,
      deviceName,
      nonce,
      roomId,
    };

    logger.info('QR pairing data generated', { deviceId, accountId });
    return { qrData, privateKey: keyPair.privateKey };
  },

  /**
   * Called on the NEW device after QR is scanned by the old device.
   * Sends DEVICE_PAIR_REQUEST and waits for DEVICE_PAIR_RESPONSE.
   * Rejects after timeoutMs if no response.
   */
  async sendPairRequest(
    qrData: PairingQRData,
    privateKey: CryptoKey,
    timeoutMs = 60_000,
  ): Promise<PairingResult> {
    const payload: DevicePairRequestPayload = {
      deviceId: qrData.deviceId,
      devicePublicKey: qrData.devicePublicKey,
      deviceName: qrData.deviceName,
      nonce: qrData.nonce,
    };

    return new Promise<PairingResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingPairs.delete(qrData.nonce);
        reject(new Error('Pairing timed out'));
      }, timeoutMs);

      pendingPairs.set(qrData.nonce, (result) => {
        clearTimeout(timer);
        pendingPairs.delete(qrData.nonce);
        resolve(result);
      });

      ProtocolService.send(
        qrData.roomId,
        MessageType.DEVICE_PAIR_REQUEST,
        payload,
        qrData.accountId,
        privateKey,
      )
        .then(() => logger.info('Pair request sent', { deviceId: qrData.deviceId }))
        .catch((err) => {
          clearTimeout(timer);
          pendingPairs.delete(qrData.nonce);
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
  },

  /**
   * Called on the OLD device when a DEVICE_PAIR_REQUEST arrives.
   * Verifies the nonce matches a known pending request, saves the new device,
   * and sends DEVICE_PAIR_RESPONSE.
   */
  async handlePairRequest(
    roomId: string,
    accountId: string,
    privateKey: CryptoKey,
    payload: DevicePairRequestPayload,
    expectedNonce: string,
    accepted: boolean,
  ): Promise<void> {
    if (payload.nonce !== expectedNonce) {
      logger.warn('Pair request nonce mismatch — ignoring', { received: payload.nonce });
      return;
    }

    if (accepted) {
      const now = Date.now();
      const device: Device = {
        id: payload.deviceId,
        accountId,
        publicKey: payload.devicePublicKey,
        name: payload.deviceName,
        createdAt: now,
        lastSeenAt: now,
      };
      await DeviceRepository.save(device);
      logger.info('New device paired and saved', { deviceId: payload.deviceId });
    }

    const response: DevicePairResponsePayload = {
      deviceId: payload.deviceId,
      nonce: payload.nonce,
      accepted,
    };

    await ProtocolService.send(
      roomId,
      MessageType.DEVICE_PAIR_RESPONSE,
      response,
      accountId,
      privateKey,
    );

    logger.info('Pair response sent', { deviceId: payload.deviceId, accepted });
  },

  /**
   * Called on the NEW device when a DEVICE_PAIR_RESPONSE arrives.
   * Resolves the pending sendPairRequest promise.
   */
  handlePairResponse(payload: DevicePairResponsePayload): void {
    const resolver = pendingPairs.get(payload.nonce);
    if (!resolver) {
      logger.warn('Pair response for unknown nonce', { nonce: payload.nonce });
      return;
    }
    resolver({ accepted: payload.accepted, deviceId: payload.deviceId });
    logger.info('Pair response handled', { deviceId: payload.deviceId, accepted: payload.accepted });
  },

  /**
   * Starts listening for DEVICE_PAIR_REQUEST (old device side) and
   * DEVICE_PAIR_RESPONSE (new device side).
   *
   * @param onPairRequest - called on the old device when a request arrives;
   *   return true to accept, false to reject.
   */
  startListening(
    accountId: string,
    privateKey: CryptoKey,
    getRoomForPeer: (peerId: string) => string | undefined,
    expectedNonce: string | null,
    onPairRequest?: (payload: DevicePairRequestPayload) => Promise<boolean>,
  ): () => void {
    const unsubReq = ProtocolService.onMessage<DevicePairRequestPayload>(
      MessageType.DEVICE_PAIR_REQUEST,
      async ({ packet, peerId }) => {
        if (!onPairRequest || !expectedNonce) return;
        const roomId = getRoomForPeer(peerId) ?? packet.payload.nonce; // fallback unused
        if (!roomId) return;
        const accepted = await onPairRequest(packet.payload);
        await PairingService.handlePairRequest(
          roomId, accountId, privateKey, packet.payload, expectedNonce, accepted,
        );
      },
    );

    const unsubRes = ProtocolService.onMessage<DevicePairResponsePayload>(
      MessageType.DEVICE_PAIR_RESPONSE,
      ({ packet }) => {
        PairingService.handlePairResponse(packet.payload);
      },
    );

    return () => { unsubReq(); unsubRes(); };
  },

  /** Clears all pending pair resolvers (used on logout / stop). */
  clearPending(): void {
    pendingPairs.clear();
  },
};

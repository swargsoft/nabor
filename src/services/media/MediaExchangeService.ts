import { ProtocolService } from '@/services/messaging/ProtocolService';
import { readFromCacheApi, writeToCacheApi } from '@/infrastructure/media/imageProcessor';
import { MediaRepository } from '@/repositories/MediaRepository';
import { validateMediaResponsePayload } from '@/infrastructure/security/SecurityGuard';
import { MessageType } from '@/types/protocol';
import type { MediaRequestPayload, MediaResponsePayload } from '@/types/protocol';
import { createLogger } from '@/utils/logger';

const logger = createLogger('MediaExchangeService');

const REQUEST_TIMEOUT_MS = 30_000;

/** Pending request resolvers: `${mediaId}:${thumbnail}` → resolve fn */
const pendingRequests = new Map<string, (url: string) => void>();

function requestKey(mediaId: string, thumbnail: boolean): string {
  return `${mediaId}:${thumbnail}`;
}

export const MediaExchangeService = {
  /**
   * Requests a media blob from a peer. Returns a Promise that resolves
   * with an object URL when the MEDIA_RESPONSE arrives.
   * Rejects after REQUEST_TIMEOUT_MS.
   */
  async requestMedia(
    roomId: string,
    senderId: string,
    privateKey: CryptoKey,
    targetPeerId: string,
    mediaId: string,
    thumbnail: boolean,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<string> {
    const key = requestKey(mediaId, thumbnail);
    const payload: MediaRequestPayload = { mediaId, thumbnail };

    await ProtocolService.send(roomId, MessageType.MEDIA_REQUEST, payload, senderId, privateKey, targetPeerId);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(key);
        reject(new Error(`Media request timed out: ${mediaId}`));
      }, timeoutMs);

      pendingRequests.set(key, (url) => {
        clearTimeout(timer);
        pendingRequests.delete(key);
        resolve(url);
      });
    });
  },

  /**
   * Handles an incoming MEDIA_REQUEST — reads the blob from Cache API
   * and sends it as base64 in a MEDIA_RESPONSE.
   */
  async handleMediaRequest(
    roomId: string,
    accountId: string,
    privateKey: CryptoKey,
    payload: MediaRequestPayload,
    requesterPeerId: string,
  ): Promise<void> {
    const metadata = await MediaRepository.get(payload.mediaId);
    if (!metadata) {
      logger.warn('Media request for unknown mediaId', { mediaId: payload.mediaId });
      return;
    }

    const cacheKey = payload.thumbnail
      ? `${metadata.cacheKey}/thumb`
      : metadata.cacheKey;

    const blob = await readFromCacheApi(cacheKey);
    if (!blob) {
      logger.warn('Media blob not in cache', { cacheKey });
      return;
    }

    const data = await blobToBase64(blob);
    const response: MediaResponsePayload = {
      mediaId: payload.mediaId,
      thumbnail: payload.thumbnail,
      data,
      mimeType: blob.type || metadata.mimeType,
    };

    await ProtocolService.send(
      roomId, MessageType.MEDIA_RESPONSE, response, accountId, privateKey, requesterPeerId,
    );
    logger.info('Media response sent', { mediaId: payload.mediaId, thumbnail: payload.thumbnail });
  },

  /**
   * Handles an incoming MEDIA_RESPONSE — stores the blob in Cache API
   * and resolves any pending request with an object URL.
   */
  async handleMediaResponse(payload: MediaResponsePayload): Promise<string> {
    const guard = validateMediaResponsePayload(payload);
    if (!guard.valid) throw new Error(`Invalid media response: ${guard.reason}`);

    const blob = base64ToBlob(payload.data, payload.mimeType);
    const cacheKey = payload.thumbnail
      ? `media/${payload.mediaId}/thumb`
      : `media/${payload.mediaId}`;

    await writeToCacheApi(cacheKey, blob);

    const url = URL.createObjectURL(blob);
    const resolver = pendingRequests.get(requestKey(payload.mediaId, payload.thumbnail));
    if (resolver) resolver(url);

    logger.info('Media received and cached', { mediaId: payload.mediaId, thumbnail: payload.thumbnail });
    return url;
  },

  /**
   * Starts listening for MEDIA_REQUEST and MEDIA_RESPONSE packets.
   * Returns a combined unsubscribe function.
   */
  startListening(
    accountId: string,
    privateKey: CryptoKey,
    getRoomForPeer: (peerId: string) => string | undefined,
  ): () => void {
    const unsubReq = ProtocolService.onMessage<MediaRequestPayload>(
      MessageType.MEDIA_REQUEST,
      async ({ packet, peerId }) => {
        const roomId = getRoomForPeer(peerId);
        if (!roomId) return;
        await MediaExchangeService.handleMediaRequest(
          roomId, accountId, privateKey, packet.payload, peerId,
        );
      },
    );

    const unsubRes = ProtocolService.onMessage<MediaResponsePayload>(
      MessageType.MEDIA_RESPONSE,
      async ({ packet }) => {
        await MediaExchangeService.handleMediaResponse(packet.payload);
      },
    );

    return () => { unsubReq(); unsubRes(); };
  },

  /** Clears pending requests (used in tests / on logout). */
  clearPending(): void {
    pendingRequests.clear();
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // data:mime/type;base64,<data>
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

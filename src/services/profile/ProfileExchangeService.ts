import { ProtocolService } from '@/services/messaging/ProtocolService';
import { ProfileService } from '@/services/profile/ProfileService';
import { generateId } from '@/infrastructure/crypto/webcrypto';
import { validateProfileResponsePayload } from '@/infrastructure/security/SecurityGuard';
import { MessageType } from '@/types/protocol';
import type { ProfileRequestPayload, ProfileResponsePayload } from '@/types/protocol';
import type { PublicProfile } from '@/services/profile/ProfileService';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ProfileExchangeService');

const REQUEST_TIMEOUT_MS = 15_000;

/** In-memory cache: peerId → PublicProfile */
const peerProfiles = new Map<string, PublicProfile>();

/** Pending request resolvers: requestId → resolve fn */
const pendingRequests = new Map<string, (profile: PublicProfile) => void>();

export const ProfileExchangeService = {
  /**
   * Sends a PROFILE_REQUEST to a peer and returns a Promise that resolves
   * with their PublicProfile when the PROFILE_RESPONSE arrives.
   * Rejects after timeoutMs if no response.
   */
  async requestProfile(
    roomId: string,
    senderId: string,
    privateKey: CryptoKey,
    targetPeerId: string,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<PublicProfile> {
    const requestId = generateId();
    const payload: ProfileRequestPayload = { requestId };

    // Send first so the requestId is in _sent before the caller reads it
    await ProtocolService.send(roomId, MessageType.PROFILE_REQUEST, payload, senderId, privateKey, targetPeerId);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error(`Profile request timed out for peer ${targetPeerId}`));
      }, timeoutMs);

      pendingRequests.set(requestId, (profile) => {
        clearTimeout(timer);
        pendingRequests.delete(requestId);
        resolve(profile);
      });
    });
  },

  /**
   * Handles an incoming PROFILE_REQUEST — responds with our PublicProfile.
   */
  async handleProfileRequest(
    roomId: string,
    accountId: string,
    privateKey: CryptoKey,
    payload: ProfileRequestPayload,
    requesterPeerId: string,
  ): Promise<void> {
    const profile = await ProfileService.getProfile(accountId);
    if (!profile) {
      logger.warn('Profile request received but no local profile exists');
      return;
    }

    const pub = ProfileService.toPublicProfile(profile);
    const response: ProfileResponsePayload = {
      requestId: payload.requestId,
      accountId: pub.accountId,
      displayName: pub.displayName,
      age: pub.age,
      bio: pub.bio,
      gender: pub.gender,
      interests: pub.interests,
      photoIds: pub.photoIds,
    };

    await ProtocolService.send(
      roomId, MessageType.PROFILE_RESPONSE, response, accountId, privateKey, requesterPeerId,
    );
    logger.info('Profile response sent', { to: requesterPeerId });
  },

  /**
   * Handles an incoming PROFILE_RESPONSE — resolves any pending request
   * and caches the profile.
   */
  handleProfileResponse(payload: ProfileResponsePayload, fromPeerId: string): void {
    const guard = validateProfileResponsePayload(payload);
    if (!guard.valid) {
      logger.warn('Invalid profile response payload', { reason: guard.reason, fromPeerId });
      return;
    }

    const profile: PublicProfile = {
      accountId: payload.accountId,
      displayName: payload.displayName,
      age: payload.age,
      bio: payload.bio,
      gender: payload.gender as PublicProfile['gender'],
      interests: payload.interests,
      photoIds: payload.photoIds,
    };

    peerProfiles.set(fromPeerId, profile);

    const resolver = pendingRequests.get(payload.requestId);
    if (resolver) resolver(profile);

    logger.info('Profile received', { fromPeerId, accountId: payload.accountId });
  },

  /**
   * Starts listening for PROFILE_REQUEST and PROFILE_RESPONSE packets.
   * Returns a combined unsubscribe function.
   */
  startListening(
    accountId: string,
    privateKey: CryptoKey,
    getRoomForPeer: (peerId: string) => string | undefined,
  ): () => void {
    const unsubReq = ProtocolService.onMessage<ProfileRequestPayload>(
      MessageType.PROFILE_REQUEST,
      async ({ packet, peerId }) => {
        const roomId = getRoomForPeer(peerId);
        if (!roomId) return;
        await ProfileExchangeService.handleProfileRequest(
          roomId, accountId, privateKey, packet.payload, peerId,
        );
      },
    );

    const unsubRes = ProtocolService.onMessage<ProfileResponsePayload>(
      MessageType.PROFILE_RESPONSE,
      ({ packet, peerId }) => {
        ProfileExchangeService.handleProfileResponse(packet.payload, peerId);
      },
    );

    return () => { unsubReq(); unsubRes(); };
  },

  /** Returns a cached peer profile, or null if not yet fetched. */
  getCachedProfile(peerId: string): PublicProfile | null {
    return peerProfiles.get(peerId) ?? null;
  },

  /** Clears the in-memory profile cache (used in tests / on logout). */
  clearCache(): void {
    peerProfiles.clear();
    pendingRequests.clear();
  },
};

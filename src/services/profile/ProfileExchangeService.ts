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

export interface DiscoveredProfile { peerId: string; roomId?: string; profile: PublicProfile; }
const peerProfiles = new Map<string, DiscoveredProfile>();
const accountToPeer = new Map<string, string>();
const pendingRequests = new Map<string, (profile: PublicProfile) => void>();
const listeners = new Set<() => void>();

function emitChange(): void { listeners.forEach((listener) => listener()); }

export const ProfileExchangeService = {
  async requestProfile(roomId: string, senderId: string, privateKey: CryptoKey, targetPeerId: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<PublicProfile> {
    const requestId = generateId();
    const payload: ProfileRequestPayload = { requestId };

    const promise = new Promise<PublicProfile>((resolve, reject) => {
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

    try {
      await ProtocolService.send(roomId, MessageType.PROFILE_REQUEST, payload, senderId, privateKey, targetPeerId);
    } catch (err) {
      pendingRequests.delete(requestId);
      throw err;
    }
    return promise;
  },

  async handleProfileRequest(roomId: string, accountId: string, privateKey: CryptoKey, payload: ProfileRequestPayload, requesterPeerId: string): Promise<void> {
    const profile = await ProfileService.getProfile(accountId);
    if (!profile) return;
    const pub = ProfileService.toPublicProfile(profile);
    const response: ProfileResponsePayload = { requestId: payload.requestId, accountId: pub.accountId, displayName: pub.displayName, age: pub.age, bio: pub.bio, gender: pub.gender, interests: pub.interests, photoIds: pub.photoIds };
    await ProtocolService.send(roomId, MessageType.PROFILE_RESPONSE, response, accountId, privateKey, requesterPeerId);
  },

  handleProfileResponse(payload: ProfileResponsePayload, fromPeerId: string, roomId?: string): void {
    const guard = validateProfileResponsePayload(payload);
    if (!guard.valid) return;
    const profile: PublicProfile = { accountId: payload.accountId, displayName: payload.displayName, age: payload.age, bio: payload.bio, gender: payload.gender as PublicProfile['gender'], interests: payload.interests, photoIds: payload.photoIds };
    peerProfiles.set(fromPeerId, { peerId: fromPeerId, roomId, profile });
    accountToPeer.set(profile.accountId, fromPeerId);
    const resolver = pendingRequests.get(payload.requestId);
    if (resolver) resolver(profile);
    emitChange();
    logger.info('Profile received', { fromPeerId, accountId: payload.accountId });
  },

  startListening(accountId: string, privateKey: CryptoKey, getRoomForPeer: (peerId: string) => string | undefined): () => void {
    const unsubReq = ProtocolService.onMessage<ProfileRequestPayload>(MessageType.PROFILE_REQUEST, async ({ packet, peerId, roomId }) => {
      const effectiveRoom = roomId || getRoomForPeer(peerId);
      if (!effectiveRoom) return;
      await ProfileExchangeService.handleProfileRequest(effectiveRoom, accountId, privateKey, packet.payload, peerId);
    });
    const unsubRes = ProtocolService.onMessage<ProfileResponsePayload>(MessageType.PROFILE_RESPONSE, ({ packet, peerId, roomId }) => ProfileExchangeService.handleProfileResponse(packet.payload, peerId, roomId));
    return () => { unsubReq(); unsubRes(); };
  },

  getCachedProfile(peerId: string): PublicProfile | null { return peerProfiles.get(peerId)?.profile ?? null; },
  getCachedProfiles(): DiscoveredProfile[] { return [...peerProfiles.values()]; },
  getPeerIdForAccount(accountId: string): string | null { return accountToPeer.get(accountId) ?? null; },
  onChange(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); },
  clearCache(): void { peerProfiles.clear(); accountToPeer.clear(); pendingRequests.clear(); emitChange(); },
};

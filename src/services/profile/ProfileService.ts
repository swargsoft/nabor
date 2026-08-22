import { ProfileRepository } from '@/repositories/ProfileRepository';
import type { Profile, Gender } from '@/types/db';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ProfileService');

export interface CreateProfileInput {
  accountId: string;
  displayName: string;
  age: number;
  bio?: string;
  gender: Gender;
  interests?: string[];
  locationEnabled?: boolean;
}

export interface UpdateProfileInput {
  displayName?: string;
  age?: number;
  bio?: string;
  gender?: Gender;
  interests?: string[];
  photoIds?: string[];
  locationEnabled?: boolean;
}

/**
 * The sanitized profile shared with peers — contains only what the user chooses to expose.
 * Never includes private fields like locationEnabled or internal IDs beyond accountId.
 */
export interface PublicProfile {
  accountId: string;
  displayName: string;
  age: number;
  bio: string;
  gender: Gender;
  interests: string[];
  photoIds: string[];
}

export const ProfileService = {
  async createProfile(input: CreateProfileInput): Promise<Profile> {
    const profile: Profile = {
      id: input.accountId,
      displayName: input.displayName.trim(),
      age: input.age,
      bio: input.bio?.trim() ?? '',
      gender: input.gender,
      interests: input.interests ?? [],
      photoIds: [],
      locationEnabled: input.locationEnabled ?? true,
      updatedAt: Date.now(),
    };
    await ProfileRepository.save(profile);
    logger.info('Profile created', { accountId: input.accountId });
    return profile;
  },

  async updateProfile(accountId: string, input: UpdateProfileInput): Promise<Profile> {
    const existing = await ProfileRepository.get(accountId);
    if (!existing) throw new Error('Profile not found');

    const updated: Profile = {
      ...existing,
      ...(input.displayName !== undefined && { displayName: input.displayName.trim() }),
      ...(input.age !== undefined && { age: input.age }),
      ...(input.bio !== undefined && { bio: input.bio.trim() }),
      ...(input.gender !== undefined && { gender: input.gender }),
      ...(input.interests !== undefined && { interests: input.interests }),
      ...(input.photoIds !== undefined && { photoIds: input.photoIds }),
      ...(input.locationEnabled !== undefined && { locationEnabled: input.locationEnabled }),
      updatedAt: Date.now(),
    };

    await ProfileRepository.save(updated);
    logger.info('Profile updated', { accountId });
    return updated;
  },

  async getProfile(accountId: string): Promise<Profile | undefined> {
    return ProfileRepository.get(accountId);
  },

  async deleteProfile(accountId: string): Promise<void> {
    await ProfileRepository.delete(accountId);
    logger.info('Profile deleted', { accountId });
  },

  /**
   * Returns a sanitized PublicProfile safe to share with peers.
   */
  toPublicProfile(profile: Profile): PublicProfile {
    return {
      accountId: profile.id,
      displayName: profile.displayName,
      age: profile.age,
      bio: profile.bio,
      gender: profile.gender,
      interests: profile.interests,
      photoIds: profile.photoIds,
    };
  },
};

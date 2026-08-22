import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/repositories/db/database';
import { ProfileService } from '@/services/profile/ProfileService';
import type { Profile } from '@/types/db';

beforeEach(async () => {
  await db.profiles.clear();
});

const base = {
  accountId: 'acc-1',
  displayName: 'Alice',
  age: 28,
  gender: 'woman' as const,
};

describe('ProfileService', () => {
  it('creates a profile with required fields', async () => {
    const profile = await ProfileService.createProfile(base);
    expect(profile.id).toBe('acc-1');
    expect(profile.displayName).toBe('Alice');
    expect(profile.age).toBe(28);
    expect(profile.gender).toBe('woman');
    expect(profile.bio).toBe('');
    expect(profile.interests).toEqual([]);
    expect(profile.photoIds).toEqual([]);
    expect(profile.locationEnabled).toBe(true);
  });

  it('creates a profile with optional fields', async () => {
    const profile = await ProfileService.createProfile({
      ...base,
      bio: 'Hello world',
      interests: ['Hiking', 'Music'],
      locationEnabled: false,
    });
    expect(profile.bio).toBe('Hello world');
    expect(profile.interests).toEqual(['Hiking', 'Music']);
    expect(profile.locationEnabled).toBe(false);
  });

  it('trims whitespace from displayName and bio', async () => {
    const profile = await ProfileService.createProfile({
      ...base,
      displayName: '  Alice  ',
      bio: '  Hello  ',
    });
    expect(profile.displayName).toBe('Alice');
    expect(profile.bio).toBe('Hello');
  });

  it('getProfile returns the saved profile', async () => {
    await ProfileService.createProfile(base);
    const profile = await ProfileService.getProfile('acc-1');
    expect(profile?.displayName).toBe('Alice');
  });

  it('getProfile returns undefined for unknown id', async () => {
    expect(await ProfileService.getProfile('unknown')).toBeUndefined();
  });

  it('updateProfile updates individual fields', async () => {
    await ProfileService.createProfile(base);
    const updated = await ProfileService.updateProfile('acc-1', { displayName: 'Bob', age: 30 });
    expect(updated.displayName).toBe('Bob');
    expect(updated.age).toBe(30);
    expect(updated.gender).toBe('woman'); // unchanged
  });

  it('updateProfile updates interests', async () => {
    await ProfileService.createProfile(base);
    const updated = await ProfileService.updateProfile('acc-1', { interests: ['Gaming'] });
    expect(updated.interests).toEqual(['Gaming']);
  });

  it('updateProfile updates photoIds', async () => {
    await ProfileService.createProfile(base);
    const updated = await ProfileService.updateProfile('acc-1', { photoIds: ['photo-1', 'photo-2'] });
    expect(updated.photoIds).toEqual(['photo-1', 'photo-2']);
  });

  it('updateProfile updates locationEnabled', async () => {
    await ProfileService.createProfile(base);
    const updated = await ProfileService.updateProfile('acc-1', { locationEnabled: false });
    expect(updated.locationEnabled).toBe(false);
  });

  it('updateProfile bumps updatedAt', async () => {
    const created = await ProfileService.createProfile(base);
    await new Promise((r) => setTimeout(r, 2));
    const updated = await ProfileService.updateProfile('acc-1', { bio: 'New bio' });
    expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
  });

  it('updateProfile throws when profile does not exist', async () => {
    await expect(ProfileService.updateProfile('missing', { bio: 'x' })).rejects.toThrow(
      'Profile not found',
    );
  });

  it('deleteProfile removes the profile', async () => {
    await ProfileService.createProfile(base);
    await ProfileService.deleteProfile('acc-1');
    expect(await ProfileService.getProfile('acc-1')).toBeUndefined();
  });

  it('toPublicProfile returns only public fields', async () => {
    const profile: Profile = {
      id: 'acc-1',
      displayName: 'Alice',
      age: 28,
      bio: 'Hello',
      gender: 'woman',
      interests: ['Hiking'],
      photoIds: ['photo-1'],
      locationEnabled: false, // private — must not appear in PublicProfile
      updatedAt: 1000,
    };
    const pub = ProfileService.toPublicProfile(profile);
    expect(pub.accountId).toBe('acc-1');
    expect(pub.displayName).toBe('Alice');
    expect(pub.age).toBe(28);
    expect(pub.bio).toBe('Hello');
    expect(pub.gender).toBe('woman');
    expect(pub.interests).toEqual(['Hiking']);
    expect(pub.photoIds).toEqual(['photo-1']);
    expect((pub as unknown as Record<string, unknown>).locationEnabled).toBeUndefined();
  });

  it('toPublicProfile does not expose internal id field', async () => {
    const profile: Profile = {
      id: 'acc-1',
      displayName: 'Alice',
      age: 28,
      bio: '',
      gender: 'man',
      interests: [],
      photoIds: [],
      locationEnabled: true,
      updatedAt: 1000,
    };
    const pub = ProfileService.toPublicProfile(profile);
    expect((pub as unknown as Record<string, unknown>).id).toBeUndefined();
    expect((pub as unknown as Record<string, unknown>).updatedAt).toBeUndefined();
  });
});

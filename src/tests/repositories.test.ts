import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/repositories/db/database';
import { IdentityRepository } from '@/repositories/IdentityRepository';
import { DeviceRepository } from '@/repositories/DeviceRepository';
import { ProfileRepository } from '@/repositories/ProfileRepository';
import { MatchRepository } from '@/repositories/MatchRepository';
import { ConversationRepository } from '@/repositories/ConversationRepository';
import { MessageRepository } from '@/repositories/MessageRepository';
import { MediaRepository } from '@/repositories/MediaRepository';
import { LocationRepository } from '@/repositories/LocationRepository';
import { DiscoveryRepository } from '@/repositories/DiscoveryRepository';
import { SettingsRepository } from '@/repositories/SettingsRepository';
import type {
  Identity, Device, Profile, Match, Conversation,
  Message, Media, Location, Discovery,
} from '@/types/db';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const identity: Identity = {
  id: 'acc-1',
  publicKey: 'pub-key-1',
  privateKey: 'priv-key-1',
  createdAt: 1000,
};

const device: Device = {
  id: 'dev-1',
  accountId: 'acc-1',
  publicKey: 'dev-pub-1',
  name: 'My Phone',
  createdAt: 1000,
  lastSeenAt: 2000,
};

const profile: Profile = {
  id: 'acc-1',
  displayName: 'Alice',
  age: 28,
  bio: 'Hello',
  gender: 'woman',
  interests: ['hiking'],
  photoIds: [],
  locationEnabled: true,
  updatedAt: 1000,
};

const match: Match = {
  id: 'match-1',
  accountId: 'acc-1',
  peerId: 'peer-1',
  status: 'pending',
  createdAt: 1000,
  updatedAt: 1000,
};

const conversation: Conversation = {
  id: 'conv-1',
  matchId: 'match-1',
  peerId: 'peer-1',
  lastMessageAt: 2000,
  createdAt: 1000,
};

const message: Message = {
  id: 'msg-1',
  conversationId: 'conv-1',
  senderId: 'acc-1',
  text: 'Hey!',
  status: 'sent',
  createdAt: 1000,
};

const media: Media = {
  id: 'media-1',
  ownerId: 'acc-1',
  hash: 'abc123',
  mimeType: 'image/jpeg',
  size: 1024,
  width: 800,
  height: 600,
  cacheKey: 'cache/media-1',
  createdAt: 1000,
  lastAccessedAt: 2000,
};

const location: Location = {
  id: 'acc-1',
  latitude: 51.5,
  longitude: -0.1,
  h3Index: '8928308280fffff',
  accuracy: 10,
  updatedAt: 1000,
};

const discovery: Discovery = {
  id: 'disc-1',
  peerId: 'peer-1',
  h3Index: '8928308280fffff',
  status: 'seen',
  seenAt: 1000,
};

// ─── Reset DB before each test ───────────────────────────────────────────────

beforeEach(async () => {
  await Promise.all([
    db.identities.clear(),
    db.devices.clear(),
    db.profiles.clear(),
    db.matches.clear(),
    db.conversations.clear(),
    db.messages.clear(),
    db.media.clear(),
    db.locations.clear(),
    db.discovery.clear(),
    db.settings.clear(),
  ]);
});

// ─── IdentityRepository ──────────────────────────────────────────────────────

describe('IdentityRepository', () => {
  it('saves and retrieves an identity', async () => {
    await IdentityRepository.save(identity);
    expect(await IdentityRepository.get('acc-1')).toEqual(identity);
  });

  it('getFirst returns the only identity', async () => {
    await IdentityRepository.save(identity);
    expect(await IdentityRepository.getFirst()).toEqual(identity);
  });

  it('deletes an identity', async () => {
    await IdentityRepository.save(identity);
    await IdentityRepository.delete('acc-1');
    expect(await IdentityRepository.get('acc-1')).toBeUndefined();
  });

  it('clear removes all identities', async () => {
    await IdentityRepository.save(identity);
    await IdentityRepository.clear();
    expect(await IdentityRepository.getFirst()).toBeUndefined();
  });
});

// ─── DeviceRepository ────────────────────────────────────────────────────────

describe('DeviceRepository', () => {
  it('saves and retrieves a device', async () => {
    await DeviceRepository.save(device);
    expect(await DeviceRepository.get('dev-1')).toEqual(device);
  });

  it('getAllForAccount returns devices by accountId', async () => {
    await DeviceRepository.save(device);
    const results = await DeviceRepository.getAllForAccount('acc-1');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('dev-1');
  });

  it('deletes a device', async () => {
    await DeviceRepository.save(device);
    await DeviceRepository.delete('dev-1');
    expect(await DeviceRepository.get('dev-1')).toBeUndefined();
  });
});

// ─── ProfileRepository ───────────────────────────────────────────────────────

describe('ProfileRepository', () => {
  it('saves and retrieves a profile', async () => {
    await ProfileRepository.save(profile);
    expect(await ProfileRepository.get('acc-1')).toEqual(profile);
  });

  it('updates a profile via put', async () => {
    await ProfileRepository.save(profile);
    await ProfileRepository.save({ ...profile, displayName: 'Bob' });
    const result = await ProfileRepository.get('acc-1');
    expect(result?.displayName).toBe('Bob');
  });

  it('deletes a profile', async () => {
    await ProfileRepository.save(profile);
    await ProfileRepository.delete('acc-1');
    expect(await ProfileRepository.get('acc-1')).toBeUndefined();
  });
});

// ─── MatchRepository ─────────────────────────────────────────────────────────

describe('MatchRepository', () => {
  it('saves and retrieves a match', async () => {
    await MatchRepository.save(match);
    expect(await MatchRepository.get('match-1')).toEqual(match);
  });

  it('getAllForAccount returns matches', async () => {
    await MatchRepository.save(match);
    const results = await MatchRepository.getAllForAccount('acc-1');
    expect(results).toHaveLength(1);
  });

  it('getByStatus filters correctly', async () => {
    await MatchRepository.save(match);
    await MatchRepository.save({ ...match, id: 'match-2', status: 'matched' });
    const pending = await MatchRepository.getByStatus('acc-1', 'pending');
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('match-1');
  });

  it('deletes a match', async () => {
    await MatchRepository.save(match);
    await MatchRepository.delete('match-1');
    expect(await MatchRepository.get('match-1')).toBeUndefined();
  });
});

// ─── ConversationRepository ──────────────────────────────────────────────────

describe('ConversationRepository', () => {
  it('saves and retrieves a conversation', async () => {
    await ConversationRepository.save(conversation);
    expect(await ConversationRepository.get('conv-1')).toEqual(conversation);
  });

  it('getAll returns conversations ordered by lastMessageAt desc', async () => {
    await ConversationRepository.save(conversation);
    await ConversationRepository.save({ ...conversation, id: 'conv-2', lastMessageAt: 5000 });
    const all = await ConversationRepository.getAll();
    expect(all[0].id).toBe('conv-2');
  });

  it('getByMatchId finds conversation', async () => {
    await ConversationRepository.save(conversation);
    const result = await ConversationRepository.getByMatchId('match-1');
    expect(result?.id).toBe('conv-1');
  });

  it('deletes a conversation', async () => {
    await ConversationRepository.save(conversation);
    await ConversationRepository.delete('conv-1');
    expect(await ConversationRepository.get('conv-1')).toBeUndefined();
  });
});

// ─── MessageRepository ───────────────────────────────────────────────────────

describe('MessageRepository', () => {
  it('saves and retrieves a message', async () => {
    await MessageRepository.save(message);
    expect(await MessageRepository.get('msg-1')).toEqual(message);
  });

  it('getForConversation returns messages sorted by createdAt', async () => {
    await MessageRepository.save(message);
    await MessageRepository.save({ ...message, id: 'msg-2', createdAt: 500 });
    const msgs = await MessageRepository.getForConversation('conv-1');
    expect(msgs[0].createdAt).toBe(500);
  });

  it('deleteForConversation removes all messages in conversation', async () => {
    await MessageRepository.save(message);
    await MessageRepository.save({ ...message, id: 'msg-2' });
    await MessageRepository.deleteForConversation('conv-1');
    const msgs = await MessageRepository.getForConversation('conv-1');
    expect(msgs).toHaveLength(0);
  });
});

// ─── MediaRepository ─────────────────────────────────────────────────────────

describe('MediaRepository', () => {
  it('saves and retrieves media', async () => {
    await MediaRepository.save(media);
    expect(await MediaRepository.get('media-1')).toEqual(media);
  });

  it('getByOwner returns media for owner', async () => {
    await MediaRepository.save(media);
    const results = await MediaRepository.getByOwner('acc-1');
    expect(results).toHaveLength(1);
  });

  it('getByHash finds media by hash', async () => {
    await MediaRepository.save(media);
    const result = await MediaRepository.getByHash('abc123');
    expect(result?.id).toBe('media-1');
  });

  it('deletes media', async () => {
    await MediaRepository.save(media);
    await MediaRepository.delete('media-1');
    expect(await MediaRepository.get('media-1')).toBeUndefined();
  });
});

// ─── LocationRepository ──────────────────────────────────────────────────────

describe('LocationRepository', () => {
  it('saves and retrieves a location', async () => {
    await LocationRepository.save(location);
    expect(await LocationRepository.get('acc-1')).toEqual(location);
  });

  it('updates location via put', async () => {
    await LocationRepository.save(location);
    await LocationRepository.save({ ...location, latitude: 52.0 });
    const result = await LocationRepository.get('acc-1');
    expect(result?.latitude).toBe(52.0);
  });

  it('deletes a location', async () => {
    await LocationRepository.save(location);
    await LocationRepository.delete('acc-1');
    expect(await LocationRepository.get('acc-1')).toBeUndefined();
  });
});

// ─── DiscoveryRepository ─────────────────────────────────────────────────────

describe('DiscoveryRepository', () => {
  it('saves and retrieves a discovery entry', async () => {
    await DiscoveryRepository.save(discovery);
    expect(await DiscoveryRepository.get('disc-1')).toEqual(discovery);
  });

  it('getByH3Index returns entries for that cell', async () => {
    await DiscoveryRepository.save(discovery);
    const results = await DiscoveryRepository.getByH3Index('8928308280fffff');
    expect(results).toHaveLength(1);
  });

  it('getByStatus filters correctly', async () => {
    await DiscoveryRepository.save(discovery);
    await DiscoveryRepository.save({ ...discovery, id: 'disc-2', status: 'liked' });
    const seen = await DiscoveryRepository.getByStatus('seen');
    expect(seen).toHaveLength(1);
    expect(seen[0].id).toBe('disc-1');
  });

  it('deletes a discovery entry', async () => {
    await DiscoveryRepository.save(discovery);
    await DiscoveryRepository.delete('disc-1');
    expect(await DiscoveryRepository.get('disc-1')).toBeUndefined();
  });
});

// ─── SettingsRepository ──────────────────────────────────────────────────────

describe('SettingsRepository', () => {
  it('returns defaults when no settings saved', async () => {
    const settings = await SettingsRepository.get();
    expect(settings.id).toBe('local');
    expect(settings.ageMin).toBe(18);
    expect(settings.radiusKm).toBe(25);
  });

  it('saves and retrieves settings', async () => {
    await SettingsRepository.save({ radiusKm: 50 });
    const settings = await SettingsRepository.get();
    expect(settings.radiusKm).toBe(50);
  });

  it('partial save merges with existing settings', async () => {
    await SettingsRepository.save({ ageMin: 21 });
    await SettingsRepository.save({ ageMax: 40 });
    const settings = await SettingsRepository.get();
    expect(settings.ageMin).toBe(21);
    expect(settings.ageMax).toBe(40);
  });

  it('clear resets to defaults', async () => {
    await SettingsRepository.save({ radiusKm: 100 });
    await SettingsRepository.clear();
    const settings = await SettingsRepository.get();
    expect(settings.radiusKm).toBe(25);
  });
});

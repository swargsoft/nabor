import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/repositories/db/database';

// vi.mock is hoisted — factories must not reference outer variables
vi.mock('@/infrastructure/media/imageProcessor', () => ({
  processImage: vi.fn(),
  writeToCacheApi: vi.fn(),
  readFromCacheApi: vi.fn(),
  deleteFromCacheApi: vi.fn(),
}));

vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:mock-url'), revokeObjectURL: vi.fn() });

import { MediaService } from '@/services/media/MediaService';
import {
  processImage,
  writeToCacheApi,
  readFromCacheApi,
  deleteFromCacheApi,
} from '@/infrastructure/media/imageProcessor';

const mockBlob = new Blob(['fake-image'], { type: 'image/jpeg' });
const mockThumbBlob = new Blob(['fake-thumb'], { type: 'image/jpeg' });

const mockProcessed = {
  blob: mockBlob,
  thumbnailBlob: mockThumbBlob,
  width: 800,
  height: 600,
  hash: 'abc123hash',
  mimeType: 'image/jpeg',
  size: 1024,
};

beforeEach(async () => {
  await db.media.clear();
  vi.clearAllMocks();
  vi.mocked(processImage).mockResolvedValue(mockProcessed);
  vi.mocked(writeToCacheApi).mockResolvedValue(undefined);
  vi.mocked(readFromCacheApi).mockResolvedValue(mockBlob);
  vi.mocked(deleteFromCacheApi).mockResolvedValue(undefined);
  vi.mocked(URL.createObjectURL).mockReturnValue('blob:mock-url');
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('mock-uuid-1234' as `${string}-${string}-${string}-${string}-${string}`);
});

describe('MediaService', () => {
  it('storeImage saves metadata to Dexie', async () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const { metadata } = await MediaService.storeImage(file, 'acc-1');

    expect(metadata.id).toBe('mock-uuid-1234');
    expect(metadata.ownerId).toBe('acc-1');
    expect(metadata.hash).toBe('abc123hash');
    expect(metadata.width).toBe(800);
    expect(metadata.height).toBe(600);
    expect(metadata.size).toBe(1024);
    expect(metadata.mimeType).toBe('image/jpeg');
  });

  it('storeImage writes full and thumbnail blobs to Cache API', async () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await MediaService.storeImage(file, 'acc-1');

    expect(writeToCacheApi).toHaveBeenCalledWith('media/mock-uuid-1234', mockBlob);
    expect(writeToCacheApi).toHaveBeenCalledWith('media/mock-uuid-1234/thumb', mockThumbBlob);
  });

  it('storeImage returns object URLs for immediate display', async () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    const { url, thumbnailUrl } = await MediaService.storeImage(file, 'acc-1');

    expect(url).toBe('blob:mock-url');
    expect(thumbnailUrl).toBe('blob:mock-url');
  });

  it('storeImage deduplicates by hash', async () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await MediaService.storeImage(file, 'acc-1');

    const { metadata: second } = await MediaService.storeImage(file, 'acc-1');
    expect(second.id).toBe('mock-uuid-1234');
    // writeToCacheApi only called for the first store (2 calls: full + thumb)
    expect(writeToCacheApi).toHaveBeenCalledTimes(2);
  });

  it('getMetadata returns saved metadata', async () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await MediaService.storeImage(file, 'acc-1');

    const meta = await MediaService.getMetadata('mock-uuid-1234');
    expect(meta?.id).toBe('mock-uuid-1234');
  });

  it('getMetadata returns undefined for unknown id', async () => {
    expect(await MediaService.getMetadata('unknown')).toBeUndefined();
  });

  it('getImageUrl reads from Cache API and returns object URL', async () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await MediaService.storeImage(file, 'acc-1');

    const url = await MediaService.getImageUrl('mock-uuid-1234');
    expect(url).toBe('blob:mock-url');
    expect(readFromCacheApi).toHaveBeenCalledWith('media/mock-uuid-1234');
  });

  it('getImageUrl returns null for unknown id', async () => {
    expect(await MediaService.getImageUrl('unknown')).toBeNull();
  });

  it('getImageUrl returns null when blob not in cache', async () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await MediaService.storeImage(file, 'acc-1');
    vi.mocked(readFromCacheApi).mockResolvedValueOnce(null);

    expect(await MediaService.getImageUrl('mock-uuid-1234')).toBeNull();
  });

  it('getThumbnailUrl reads thumbnail from Cache API', async () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await MediaService.storeImage(file, 'acc-1');

    const url = await MediaService.getThumbnailUrl('mock-uuid-1234');
    expect(url).toBe('blob:mock-url');
    expect(readFromCacheApi).toHaveBeenCalledWith('media/mock-uuid-1234/thumb');
  });

  it('getMediaByOwner returns all media for owner', async () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await MediaService.storeImage(file, 'acc-1');

    const list = await MediaService.getMediaByOwner('acc-1');
    expect(list).toHaveLength(1);
    expect(list[0].ownerId).toBe('acc-1');
  });

  it('deleteMedia removes metadata from Dexie and blobs from Cache API', async () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await MediaService.storeImage(file, 'acc-1');

    await MediaService.deleteMedia('mock-uuid-1234');

    expect(deleteFromCacheApi).toHaveBeenCalledWith('media/mock-uuid-1234');
    expect(deleteFromCacheApi).toHaveBeenCalledWith('media/mock-uuid-1234/thumb');
    expect(await MediaService.getMetadata('mock-uuid-1234')).toBeUndefined();
  });

  it('deleteMedia is a no-op for unknown id', async () => {
    await MediaService.deleteMedia('unknown');
    expect(deleteFromCacheApi).not.toHaveBeenCalled();
  });
});

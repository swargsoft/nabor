import { processImage, writeToCacheApi, readFromCacheApi, deleteFromCacheApi } from '@/infrastructure/media/imageProcessor';
import { MediaRepository } from '@/repositories/MediaRepository';
import type { Media } from '@/types/db';
import { createLogger } from '@/utils/logger';

const logger = createLogger('MediaService');

export interface StoredMedia {
  metadata: Media;
  url: string;
  thumbnailUrl: string;
}

export const MediaService = {
  /**
   * Runs the full image pipeline and persists metadata + blobs.
   * Returns the stored media record with object URLs for immediate display.
   */
  async storeImage(file: File, ownerId: string): Promise<StoredMedia> {
    const processed = await processImage(file);

    // Deduplicate by hash
    const existing = await MediaRepository.getByHash(processed.hash);
    if (existing) {
      logger.info('Duplicate image detected, reusing existing media', { id: existing.id });
      const url = await MediaService.getImageUrl(existing.id);
      const thumbnailUrl = await MediaService.getThumbnailUrl(existing.id);
      return { metadata: existing, url: url ?? '', thumbnailUrl: thumbnailUrl ?? '' };
    }

    const mediaId = crypto.randomUUID();
    const cacheKey = `media/${mediaId}`;
    const thumbCacheKey = `media/${mediaId}/thumb`;

    await writeToCacheApi(cacheKey, processed.blob);
    await writeToCacheApi(thumbCacheKey, processed.thumbnailBlob);

    const now = Date.now();
    const metadata: Media = {
      id: mediaId,
      ownerId,
      hash: processed.hash,
      mimeType: processed.mimeType,
      size: processed.size,
      width: processed.width,
      height: processed.height,
      cacheKey,
      createdAt: now,
      lastAccessedAt: now,
    };

    await MediaRepository.save(metadata);
    logger.info('Image stored', { mediaId, ownerId, size: processed.size });

    return {
      metadata,
      url: URL.createObjectURL(processed.blob),
      thumbnailUrl: URL.createObjectURL(processed.thumbnailBlob),
    };
  },

  /**
   * Retrieves the full-size image blob URL. Returns null if not in cache.
   */
  async getImageUrl(mediaId: string): Promise<string | null> {
    const metadata = await MediaRepository.get(mediaId);
    if (!metadata) return null;

    const blob = await readFromCacheApi(metadata.cacheKey);
    if (!blob) return null;

    await MediaRepository.save({ ...metadata, lastAccessedAt: Date.now() });
    return URL.createObjectURL(blob);
  },

  /**
   * Retrieves the thumbnail blob URL. Returns null if not in cache.
   */
  async getThumbnailUrl(mediaId: string): Promise<string | null> {
    const metadata = await MediaRepository.get(mediaId);
    if (!metadata) return null;

    const blob = await readFromCacheApi(`${metadata.cacheKey}/thumb`);
    if (!blob) return null;

    return URL.createObjectURL(blob);
  },

  /**
   * Returns metadata for all media owned by a user.
   */
  async getMediaByOwner(ownerId: string): Promise<Media[]> {
    return MediaRepository.getByOwner(ownerId);
  },

  /**
   * Deletes a media item — removes both Cache API blobs and Dexie metadata.
   */
  async deleteMedia(mediaId: string): Promise<void> {
    const metadata = await MediaRepository.get(mediaId);
    if (!metadata) return;

    await deleteFromCacheApi(metadata.cacheKey);
    await deleteFromCacheApi(`${metadata.cacheKey}/thumb`);
    await MediaRepository.delete(mediaId);
    logger.info('Media deleted', { mediaId });
  },

  /**
   * Returns metadata only (no blob retrieval).
   */
  async getMetadata(mediaId: string): Promise<Media | undefined> {
    return MediaRepository.get(mediaId);
  },
};

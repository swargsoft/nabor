export interface ProcessedImage {
  blob: Blob;
  thumbnailBlob: Blob;
  width: number;
  height: number;
  hash: string;
  mimeType: string;
  size: number;
}

const MAX_DIMENSION = 1200;
const THUMBNAIL_DIMENSION = 200;
const QUALITY = 0.82;
const THUMBNAIL_QUALITY = 0.75;
const OUTPUT_MIME = 'image/jpeg';

/**
 * Full image pipeline: resize → compress → thumbnail → hash.
 */
export async function processImage(file: File): Promise<ProcessedImage> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = scaleDimensions(bitmap.width, bitmap.height, MAX_DIMENSION);
  const thumbDims = scaleDimensions(bitmap.width, bitmap.height, THUMBNAIL_DIMENSION);

  const blob = await renderToBlob(bitmap, width, height, QUALITY);
  const thumbnailBlob = await renderToBlob(bitmap, thumbDims.width, thumbDims.height, THUMBNAIL_QUALITY);
  bitmap.close();

  const hash = await hashBlob(blob);

  return {
    blob,
    thumbnailBlob,
    width,
    height,
    hash,
    mimeType: OUTPUT_MIME,
    size: blob.size,
  };
}

/**
 * Stores a blob in the Cache API under the given key.
 */
export async function writeToCacheApi(cacheKey: string, blob: Blob): Promise<void> {
  const cache = await caches.open('nabor-media-v1');
  await cache.put(cacheKey, new Response(blob, { headers: { 'Content-Type': blob.type } }));
}

/**
 * Reads a blob from the Cache API. Returns null if not found.
 */
export async function readFromCacheApi(cacheKey: string): Promise<Blob | null> {
  const cache = await caches.open('nabor-media-v1');
  const response = await cache.match(cacheKey);
  return response ? response.blob() : null;
}

/**
 * Deletes a blob from the Cache API.
 */
export async function deleteFromCacheApi(cacheKey: string): Promise<void> {
  const cache = await caches.open('nabor-media-v1');
  await cache.delete(cacheKey);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scaleDimensions(
  srcW: number,
  srcH: number,
  maxDim: number,
): { width: number; height: number } {
  if (srcW <= maxDim && srcH <= maxDim) return { width: srcW, height: srcH };
  const ratio = Math.min(maxDim / srcW, maxDim / srcH);
  return { width: Math.round(srcW * ratio), height: Math.round(srcH * ratio) };
}

async function renderToBlob(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context');
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas.convertToBlob({ type: OUTPUT_MIME, quality });
}

async function hashBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

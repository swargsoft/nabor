import { useCallback, useEffect, useState } from 'react';
import { MediaService } from '@/services/media/MediaService';
import type { Media } from '@/types/db';

export function useMedia(ownerId: string | undefined) {
  const [mediaList, setMediaList] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerId) {
      setLoading(false);
      return;
    }
    MediaService.getMediaByOwner(ownerId).then((list) => {
      setMediaList(list);
      setLoading(false);
    });
  }, [ownerId]);

  const storeImage = useCallback(
    async (file: File) => {
      if (!ownerId) throw new Error('No ownerId');
      const stored = await MediaService.storeImage(file, ownerId);
      setMediaList((prev) => [...prev, stored.metadata]);
      return stored;
    },
    [ownerId],
  );

  const deleteMedia = useCallback(async (mediaId: string) => {
    await MediaService.deleteMedia(mediaId);
    setMediaList((prev) => prev.filter((m) => m.id !== mediaId));
  }, []);

  return { mediaList, loading, storeImage, deleteMedia };
}

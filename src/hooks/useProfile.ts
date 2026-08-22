import { useCallback, useEffect, useState } from 'react';
import { ProfileService, type UpdateProfileInput } from '@/services/profile/ProfileService';
import type { Profile } from '@/types/db';

export function useProfile(accountId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accountId) {
      setLoading(false);
      return;
    }
    ProfileService.getProfile(accountId).then((p) => {
      setProfile(p ?? null);
      setLoading(false);
    });
  }, [accountId]);

  const saveProfile = useCallback(
    async (input: UpdateProfileInput) => {
      if (!accountId) throw new Error('No accountId');
      const updated = await ProfileService.updateProfile(accountId, input);
      setProfile(updated);
      return updated;
    },
    [accountId],
  );

  return { profile, loading, saveProfile };
}

import { useCallback, useEffect, useState } from 'react';
import { MatchRepository } from '@/repositories/MatchRepository';
import { ConversationRepository } from '@/repositories/ConversationRepository';
import { ProfileExchangeService } from '@/services/profile/ProfileExchangeService';
import { SessionService } from '@/services/SessionService';
import type { Match, Conversation } from '@/types/db';
import type { PublicProfile } from '@/services/profile/ProfileService';

export interface MatchEntry {
  match: Match;
  conversation: Conversation;
  peerProfile: PublicProfile | null;
}

export function useMatches(accountId: string | undefined) {
  const [entries, setEntries] = useState<MatchEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accountId) { setLoading(false); return; }
    const matches = await MatchRepository.getByStatus(accountId, 'matched');
    const result: MatchEntry[] = [];
    for (const match of matches) {
      const conversation = await ConversationRepository.getByMatchId(match.id);
      if (!conversation) continue;
      result.push({
        match,
        conversation,
        peerProfile: ProfileExchangeService.getCachedProfile(match.peerId),
      });
    }
    // Sort newest conversation first
    result.sort((a, b) => b.conversation.lastMessageAt - a.conversation.lastMessageAt);
    setEntries(result);
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    void load();
    const unsubSession = SessionService.onEvent((event) => {
      if (event.type === 'match' || event.type === 'message_received') void load();
    });
    const unsubProfile = ProfileExchangeService.onChange(() => void load());
    return () => { unsubSession(); unsubProfile(); };
  }, [load]);

  return { entries, loading, reload: load };
}

import { sha256 } from '@/infrastructure/crypto/webcrypto';

/**
 * Returns the canonical conversation id for two Nabor accounts.
 *
 * The id is deterministic on both peers and has the same 32-hex-character
 * shape as generateId(), so it is safe for protocol/security validators.
 */
export async function getConversationId(accountA: string, accountB: string): Promise<string> {
  if (!accountA || !accountB || accountA === accountB) {
    throw new Error('Cannot create conversation id for invalid account pair');
  }

  const [first, second] = [accountA, accountB].sort();
  const digest = await sha256(`nabor-conversation-v1:${first}:${second}`);
  return digest.slice(0, 32);
}

export function isCanonicalConversationId(id: string): boolean {
  return /^[a-f0-9]{32}$/.test(id);
}

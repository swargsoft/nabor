import { generateMnemonic, mnemonicToEntropy, entropyToMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

export type WordCount = 12 | 24;

/**
 * Generates a BIP-39 mnemonic from fresh random entropy.
 * 12 words = 128 bits, 24 words = 256 bits.
 */
export function createMnemonic(wordCount: WordCount = 12): string {
  const strength = wordCount === 24 ? 256 : 128;
  return generateMnemonic(wordlist, strength);
}

/**
 * Converts a mnemonic back to its raw entropy bytes.
 */
export function mnemonicToBytes(mnemonic: string): Uint8Array {
  return mnemonicToEntropy(mnemonic.trim().toLowerCase(), wordlist);
}

/**
 * Converts raw entropy bytes back to a mnemonic.
 */
export function bytesToMnemonic(entropy: Uint8Array): string {
  return entropyToMnemonic(entropy, wordlist);
}

/**
 * Validates a mnemonic phrase.
 */
export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic.trim().toLowerCase(), wordlist);
}

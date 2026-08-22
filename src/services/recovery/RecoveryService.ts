import { mnemonicToBytes, bytesToMnemonic, isValidMnemonic, type WordCount } from '@/infrastructure/crypto/mnemonic';
import {
  deriveKeyPairFromSeed,
  exportPublicKey,
  sha256,
  generateId,
  generateKeyPair,
} from '@/infrastructure/crypto/webcrypto';
import { IdentityRepository } from '@/repositories/IdentityRepository';
import { DeviceRepository } from '@/repositories/DeviceRepository';
import type { Identity, Device } from '@/types/db';
import { createLogger } from '@/utils/logger';

const logger = createLogger('RecoveryService');

export interface RecoveryResult {
  identity: Identity;
  device: Device;
}

export const RecoveryService = {
  /**
   * Generates a BIP-39 mnemonic from the stored master entropy.
   * identity.privateKey is the raw 32-byte entropy in base64.
   *
   * 24 words = full 32-byte entropy → fully recoverable (canonical).
   * 12 words = first 16 bytes of entropy → recovers a derived sub-identity.
   */
  async generatePhrase(masterEntropyBase64: string, wordCount: WordCount = 24): Promise<string> {
    const entropy32 = base64ToBytes(masterEntropyBase64);
    const entropy = wordCount === 24 ? entropy32 : entropy32.slice(0, 16);
    const phrase = bytesToMnemonic(entropy);
    logger.info('Recovery phrase generated', { wordCount });
    return phrase;
  },

  /**
   * Validates a recovery phrase without restoring anything.
   */
  validatePhrase(phrase: string): boolean {
    return isValidMnemonic(phrase);
  },

  /**
   * Recovers a master identity from a recovery phrase and registers a new device.
   * Restores: identity + account ownership.
   * Does NOT restore: messages, matches, media.
   */
  async recoverIdentity(phrase: string, deviceName: string = 'My Device'): Promise<RecoveryResult> {
    if (!isValidMnemonic(phrase)) {
      throw new Error('Invalid recovery phrase');
    }

    logger.info('Recovering identity from phrase');

    const entropy = mnemonicToBytes(phrase); // 16 bytes (12-word) or 32 bytes (24-word)
    const masterKeyPair = await deriveKeyPairFromSeed(entropy);
    const masterPublicKey = await exportPublicKey(masterKeyPair.publicKey);
    const accountId = await sha256(masterPublicKey);

    const deviceKeyPair = await generateKeyPair();
    const devicePublicKey = await exportPublicKey(deviceKeyPair.publicKey);
    const deviceId = generateId();
    const now = Date.now();

    const identity: Identity = {
      id: accountId,
      publicKey: masterPublicKey,
      privateKey: bytesToBase64(entropy),
      createdAt: now,
    };

    const device: Device = {
      id: deviceId,
      accountId,
      publicKey: devicePublicKey,
      name: deviceName,
      createdAt: now,
      lastSeenAt: now,
    };

    await IdentityRepository.save(identity);
    await DeviceRepository.save(device);

    logger.info('Identity recovered', { accountId, deviceId });
    return { identity, device };
  },

  /**
   * Re-derives the recovery phrase from the currently stored identity.
   */
  async getPhraseForCurrentIdentity(wordCount: WordCount = 24): Promise<string> {
    const identity = await IdentityRepository.getFirst();
    if (!identity) throw new Error('No identity found');
    return RecoveryService.generatePhrase(identity.privateKey, wordCount);
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

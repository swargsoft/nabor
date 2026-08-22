import {
  generateKeyPair,
  exportPublicKey,
  deriveKeyPairFromSeed,
  sha256,
  generateId,
} from '@/infrastructure/crypto/webcrypto';
import { IdentityRepository } from '@/repositories/IdentityRepository';
import { DeviceRepository } from '@/repositories/DeviceRepository';
import type { Identity, Device } from '@/types/db';
import { createLogger } from '@/utils/logger';

const logger = createLogger('AuthService');

export interface FullIdentity {
  identity: Identity;
  device: Device;
}

export const AuthService = {
  /**
   * Creates a new master identity + device identity, persists both locally.
   * identity.privateKey stores the raw 32-byte entropy (base64) — the recovery seed.
   * accountId = SHA-256(masterPublicKey)
   */
  async createIdentity(deviceName: string = 'My Device'): Promise<FullIdentity> {
    logger.info('Creating new identity');

    // 32 bytes of random entropy — this IS the recovery seed
    const masterEntropy = crypto.getRandomValues(new Uint8Array(32));
    const masterKeyPair = await deriveKeyPairFromSeed(masterEntropy);
    const masterPublicKey = await exportPublicKey(masterKeyPair.publicKey);
    // Store raw entropy as privateKey so phrase generation is a direct encode
    const masterPrivateKey = bytesToBase64(masterEntropy);
    const accountId = await sha256(masterPublicKey);

    // Device key pair is always random — ephemeral, not recoverable by design
    const deviceKeyPair = await generateKeyPair();
    const devicePublicKey = await exportPublicKey(deviceKeyPair.publicKey);
    const deviceId = generateId();
    const now = Date.now();

    const identity: Identity = {
      id: accountId,
      publicKey: masterPublicKey,
      privateKey: masterPrivateKey,
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

    logger.info('Identity created', { accountId, deviceId });
    return { identity, device };
  },

  /**
   * Restores identity from local storage. Returns null if none exists.
   */
  async restoreIdentity(): Promise<FullIdentity | null> {
    const identity = await IdentityRepository.getFirst();
    if (!identity) {
      logger.info('No local identity found');
      return null;
    }

    const devices = await DeviceRepository.getAllForAccount(identity.id);
    const device = devices[0];
    if (!device) {
      logger.warn('Identity found but no device record');
      return null;
    }

    logger.info('Identity restored', { accountId: identity.id, deviceId: device.id });
    return { identity, device };
  },

  /**
   * Returns true if a local identity exists.
   */
  async hasIdentity(): Promise<boolean> {
    const identity = await IdentityRepository.getFirst();
    return identity !== undefined;
  },

  /**
   * Wipes the local identity and device records.
   */
  async deleteIdentity(): Promise<void> {
    await IdentityRepository.clear();
    await DeviceRepository.clear();
    logger.info('Identity deleted');
  },
};

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

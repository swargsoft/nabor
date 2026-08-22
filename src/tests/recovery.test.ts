import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/repositories/db/database';
import { AuthService } from '@/services/auth/AuthService';
import { RecoveryService } from '@/services/recovery/RecoveryService';
import { createMnemonic, isValidMnemonic, mnemonicToBytes, bytesToMnemonic } from '@/infrastructure/crypto/mnemonic';

beforeEach(async () => {
  await db.identities.clear();
  await db.devices.clear();
});

// ─── Mnemonic ────────────────────────────────────────────────────────────────

describe('mnemonic', () => {
  it('generates a valid 12-word phrase', () => {
    const phrase = createMnemonic(12);
    expect(phrase.split(' ')).toHaveLength(12);
    expect(isValidMnemonic(phrase)).toBe(true);
  });

  it('generates a valid 24-word phrase', () => {
    const phrase = createMnemonic(24);
    expect(phrase.split(' ')).toHaveLength(24);
    expect(isValidMnemonic(phrase)).toBe(true);
  });

  it('generates different phrases each time', () => {
    expect(createMnemonic(12)).not.toBe(createMnemonic(12));
  });

  it('rejects an invalid phrase', () => {
    expect(isValidMnemonic('not a valid phrase at all')).toBe(false);
  });

  it('round-trips entropy through mnemonic', () => {
    const phrase = createMnemonic(12);
    const entropy = mnemonicToBytes(phrase);
    const restored = bytesToMnemonic(entropy);
    expect(restored).toBe(phrase);
  });
});

// ─── RecoveryService ─────────────────────────────────────────────────────────

describe('RecoveryService', () => {
  it('validatePhrase returns true for a valid phrase', () => {
    const phrase = createMnemonic(12);
    expect(RecoveryService.validatePhrase(phrase)).toBe(true);
  });

  it('validatePhrase returns false for garbage input', () => {
    expect(RecoveryService.validatePhrase('garbage words here')).toBe(false);
  });

  it('generates a 24-word recovery phrase from a stored identity', async () => {
    await AuthService.createIdentity();
    const phrase = await RecoveryService.getPhraseForCurrentIdentity(24);
    expect(phrase.split(' ')).toHaveLength(24);
    expect(isValidMnemonic(phrase)).toBe(true);
  });

  it('generates a 12-word recovery phrase from a stored identity', async () => {
    await AuthService.createIdentity();
    const phrase = await RecoveryService.getPhraseForCurrentIdentity(12);
    expect(phrase.split(' ')).toHaveLength(12);
    expect(isValidMnemonic(phrase)).toBe(true);
  });

  it('generates the same phrase for the same identity every time', async () => {
    await AuthService.createIdentity();
    const phrase1 = await RecoveryService.getPhraseForCurrentIdentity(24);
    const phrase2 = await RecoveryService.getPhraseForCurrentIdentity(24);
    expect(phrase1).toBe(phrase2);
  });

  it('24-word phrase recovers the same accountId', async () => {
    const { identity: original } = await AuthService.createIdentity();
    const phrase = await RecoveryService.getPhraseForCurrentIdentity(24);

    await db.identities.clear();
    await db.devices.clear();

    const { identity: recovered } = await RecoveryService.recoverIdentity(phrase, 'New Device');
    expect(recovered.id).toBe(original.id);
  });

  it('24-word phrase recovers the same public key', async () => {
    const { identity: original } = await AuthService.createIdentity();
    const phrase = await RecoveryService.getPhraseForCurrentIdentity(24);

    await db.identities.clear();
    await db.devices.clear();

    const { identity: recovered } = await RecoveryService.recoverIdentity(phrase);
    expect(recovered.publicKey).toBe(original.publicKey);
  });

  it('recovered device has a new deviceId', async () => {
    const { device: original } = await AuthService.createIdentity();
    const phrase = await RecoveryService.getPhraseForCurrentIdentity(24);

    await db.identities.clear();
    await db.devices.clear();

    const { device: recovered } = await RecoveryService.recoverIdentity(phrase, 'New Device');
    expect(recovered.id).not.toBe(original.id);
    expect(recovered.name).toBe('New Device');
  });

  it('recovered device is linked to the correct accountId', async () => {
    const { identity: original } = await AuthService.createIdentity();
    const phrase = await RecoveryService.getPhraseForCurrentIdentity(24);

    await db.identities.clear();
    await db.devices.clear();

    const { device } = await RecoveryService.recoverIdentity(phrase);
    expect(device.accountId).toBe(original.id);
  });

  it('12-word phrase produces a consistent sub-identity', async () => {
    await AuthService.createIdentity();
    const phrase = await RecoveryService.getPhraseForCurrentIdentity(12);

    await db.identities.clear();
    await db.devices.clear();

    const { identity: r1 } = await RecoveryService.recoverIdentity(phrase);

    await db.identities.clear();
    await db.devices.clear();

    const { identity: r2 } = await RecoveryService.recoverIdentity(phrase);
    expect(r1.id).toBe(r2.id);
  });

  it('throws on invalid phrase', async () => {
    await expect(RecoveryService.recoverIdentity('bad phrase here')).rejects.toThrow(
      'Invalid recovery phrase',
    );
  });

  it('getPhraseForCurrentIdentity throws when no identity exists', async () => {
    await expect(RecoveryService.getPhraseForCurrentIdentity()).rejects.toThrow('No identity found');
  });
});

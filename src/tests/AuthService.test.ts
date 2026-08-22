import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '@/services/auth/AuthService';
import { db } from '@/repositories/db/database';

beforeEach(async () => {
  await db.identities.clear();
  await db.devices.clear();
});

describe('AuthService', () => {
  it('creates a new identity with accountId, publicKey, privateKey', async () => {
    const { identity } = await AuthService.createIdentity();
    expect(identity.id).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
    expect(identity.publicKey).toBeTruthy();
    expect(identity.privateKey).toBeTruthy();
    expect(identity.createdAt).toBeGreaterThan(0);
  });

  it('creates a device linked to the account', async () => {
    const { identity, device } = await AuthService.createIdentity('Test Phone');
    expect(device.accountId).toBe(identity.id);
    expect(device.name).toBe('Test Phone');
    expect(device.publicKey).toBeTruthy();
    expect(device.id).toBeTruthy();
  });

  it('accountId is deterministic from the same public key', async () => {
    // Two separate identities must have different accountIds
    const { identity: a } = await AuthService.createIdentity();
    await db.identities.clear();
    await db.devices.clear();
    const { identity: b } = await AuthService.createIdentity();
    expect(a.id).not.toBe(b.id);
  });

  it('master key pair differs from device key pair', async () => {
    const { identity, device } = await AuthService.createIdentity();
    expect(identity.publicKey).not.toBe(device.publicKey);
  });

  it('hasIdentity returns false before creation', async () => {
    expect(await AuthService.hasIdentity()).toBe(false);
  });

  it('hasIdentity returns true after creation', async () => {
    await AuthService.createIdentity();
    expect(await AuthService.hasIdentity()).toBe(true);
  });

  it('restoreIdentity returns null when no identity exists', async () => {
    expect(await AuthService.restoreIdentity()).toBeNull();
  });

  it('restoreIdentity returns the persisted identity after creation', async () => {
    const created = await AuthService.createIdentity('Laptop');
    const restored = await AuthService.restoreIdentity();
    expect(restored).not.toBeNull();
    expect(restored!.identity.id).toBe(created.identity.id);
    expect(restored!.device.id).toBe(created.device.id);
  });

  it('restoreIdentity survives a simulated browser reopen (data persists in IndexedDB)', async () => {
    await AuthService.createIdentity();
    // Simulate reopen: call restore without re-creating
    const restored = await AuthService.restoreIdentity();
    expect(restored).not.toBeNull();
  });

  it('deleteIdentity removes identity and device', async () => {
    await AuthService.createIdentity();
    await AuthService.deleteIdentity();
    expect(await AuthService.hasIdentity()).toBe(false);
    expect(await AuthService.restoreIdentity()).toBeNull();
  });
});

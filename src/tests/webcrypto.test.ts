import { describe, it, expect } from 'vitest';
import {
  generateKeyPair,
  exportPublicKey,
  exportPrivateKey,
  importPublicKey,
  importPrivateKey,
  sign,
  verify,
  sha256,
  generateId,
} from '@/infrastructure/crypto/webcrypto';

describe('webcrypto', () => {
  it('generates a key pair', async () => {
    const kp = await generateKeyPair();
    expect(kp.publicKey).toBeDefined();
    expect(kp.privateKey).toBeDefined();
  });

  it('exports public key as base64 string', async () => {
    const kp = await generateKeyPair();
    const pub = await exportPublicKey(kp.publicKey);
    expect(typeof pub).toBe('string');
    expect(pub.length).toBeGreaterThan(0);
  });

  it('exports private key as base64 string', async () => {
    const kp = await generateKeyPair();
    const priv = await exportPrivateKey(kp.privateKey);
    expect(typeof priv).toBe('string');
    expect(priv.length).toBeGreaterThan(0);
  });

  it('round-trips public key through import/export', async () => {
    const kp = await generateKeyPair();
    const exported = await exportPublicKey(kp.publicKey);
    const imported = await importPublicKey(exported);
    const reExported = await exportPublicKey(imported);
    expect(reExported).toBe(exported);
  });

  it('round-trips private key through import/export', async () => {
    const kp = await generateKeyPair();
    const exported = await exportPrivateKey(kp.privateKey);
    const imported = await importPrivateKey(exported);
    const reExported = await exportPrivateKey(imported);
    expect(reExported).toBe(exported);
  });

  it('signs and verifies data', async () => {
    const kp = await generateKeyPair();
    const sig = await sign(kp.privateKey, 'hello nabor');
    const valid = await verify(kp.publicKey, sig, 'hello nabor');
    expect(valid).toBe(true);
  });

  it('rejects tampered data', async () => {
    const kp = await generateKeyPair();
    const sig = await sign(kp.privateKey, 'hello nabor');
    const valid = await verify(kp.publicKey, sig, 'tampered');
    expect(valid).toBe(false);
  });

  it('sha256 produces a consistent hex string', async () => {
    const h1 = await sha256('nabor');
    const h2 = await sha256('nabor');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sha256 produces different hashes for different inputs', async () => {
    const h1 = await sha256('nabor');
    const h2 = await sha256('nabor2');
    expect(h1).not.toBe(h2);
  });

  it('generateId produces a unique hex string each time', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]+$/);
  });
});

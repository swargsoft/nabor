const ECDSA_PARAMS: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN_PARAMS: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' };

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(ECDSA_PARAMS, true, ['sign', 'verify']);
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('spki', key);
  return bufferToBase64(raw);
}

export async function exportPrivateKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('pkcs8', key);
  return bufferToBase64(raw);
}

export async function importPublicKey(base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    base64ToBuffer(base64),
    ECDSA_PARAMS,
    true,
    ['verify'],
  );
}

export async function importPrivateKey(base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    base64ToBuffer(base64),
    ECDSA_PARAMS,
    true,
    ['sign'],
  );
}

export async function sign(privateKey: CryptoKey, data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const signature = await crypto.subtle.sign(SIGN_PARAMS, privateKey, encoded);
  return bufferToBase64(signature);
}

export async function verify(
  publicKey: CryptoKey,
  signature: string,
  data: string,
): Promise<boolean> {
  const encoded = new TextEncoder().encode(data);
  return crypto.subtle.verify(SIGN_PARAMS, publicKey, base64ToBuffer(signature), encoded);
}

export async function sha256(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return bufferToHex(hash);
}

/**
 * Derives a deterministic ECDSA P-256 key pair from raw seed bytes.
 * Uses HKDF to stretch the seed into key material, then imports as a raw private scalar
 * via the noble/curves P-256 implementation.
 */
export async function deriveKeyPairFromSeed(seed: Uint8Array): Promise<CryptoKeyPair> {
  // Copy into a plain ArrayBuffer to satisfy WebCrypto's BufferSource constraint
  const seedBuf = seed.buffer.slice(seed.byteOffset, seed.byteOffset + seed.byteLength) as ArrayBuffer;
  const hkdfKey = await crypto.subtle.importKey('raw', seedBuf, 'HKDF', false, ['deriveKey']);
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('nabor-master-v1') },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt'],
  );
  // Export the 32-byte AES key material and use it as a P-256 private scalar
  const rawKeyMaterial = await crypto.subtle.exportKey('raw', aesKey) as ArrayBuffer;
  const { p256 } = await import('@noble/curves/nist.js');
  const privBytes = new Uint8Array(rawKeyMaterial);
  // Derive uncompressed public key from private scalar
  const pubSpki = p256.getPublicKey(privBytes, false); // 65-byte uncompressed point
  const privHex = Array.from(privBytes).map((b) => b.toString(16).padStart(2, '0')).join('');

  // Import private key as PKCS8
  const pkcs8 = buildPkcs8(hexToBytes(privHex));
  const privateKey = await crypto.subtle.importKey('pkcs8', pkcs8, ECDSA_PARAMS, true, ['sign']);

  // Import public key as SPKI
  const spki = buildSpki(pubSpki);
  const publicKey = await crypto.subtle.importKey('spki', spki, ECDSA_PARAMS, true, ['verify']);

  return { privateKey, publicKey };
}

// ─── ASN.1 / DER helpers for manual key wrapping ─────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/**
 * Wraps a raw 32-byte P-256 private scalar into a minimal PKCS#8 DER structure.
 * RFC 5958 / SEC1 encoding for P-256.
 */
function buildPkcs8(privBytes: Uint8Array): ArrayBuffer {
  // ECPrivateKey (SEC1): SEQUENCE { version INTEGER 1, privateKey OCTET STRING, [0] OID }
  const oid = new Uint8Array([0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]); // P-256
  const ecPriv = concat([
    new Uint8Array([0x02, 0x01, 0x01]),           // version = 1
    tlv(0x04, privBytes),                          // privateKey
  ]);
  const ecPrivSeq = tlv(0x30, ecPriv);
  // AlgorithmIdentifier: SEQUENCE { OID ecPublicKey, OID P-256 }
  const ecPubOid = new Uint8Array([0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);
  const algId = tlv(0x30, concat([ecPubOid, oid]));
  // PKCS#8: SEQUENCE { version 0, algId, OCTET STRING(ecPrivSeq) }
  const inner = concat([
    new Uint8Array([0x02, 0x01, 0x00]),
    algId,
    tlv(0x04, ecPrivSeq),
  ]);
  return tlv(0x30, inner).buffer as ArrayBuffer;
}

/**
 * Wraps a raw 65-byte uncompressed P-256 public key into a minimal SPKI DER structure.
 */
function buildSpki(pubBytes: Uint8Array): ArrayBuffer {
  const ecPubOid = new Uint8Array([0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);
  const oid = new Uint8Array([0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]);
  const algId = tlv(0x30, concat([ecPubOid, oid]));
  const bitString = concat([new Uint8Array([0x00]), pubBytes]);
  const inner = concat([algId, tlv(0x03, bitString)]);
  return tlv(0x30, inner).buffer as ArrayBuffer;
}

function tlv(tag: number, value: Uint8Array): Uint8Array {
  const len = derLength(value.length);
  const out = new Uint8Array(1 + len.length + value.length);
  out[0] = tag;
  out.set(len, 1);
  out.set(value, 1 + len.length);
  return out;
}

function derLength(n: number): Uint8Array {
  if (n < 0x80) return new Uint8Array([n]);
  if (n < 0x100) return new Uint8Array([0x81, n]);
  return new Uint8Array([0x82, (n >> 8) & 0xff, n & 0xff]);
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

export function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bufferToHex(bytes.buffer as ArrayBuffer);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

import { sign, verify, importPublicKey, generateId } from '@/infrastructure/crypto/webcrypto';
import type { Packet, UnsignedPacket, PayloadMap } from '@/types/protocol';
import { MessageType, PROTOCOL_VERSION } from '@/types/protocol';

/**
 * Serialises the unsigned portion of a packet for signing/verification.
 * Top-level keys are sorted for deterministic output; nested values are untouched.
 */
function serialiseForSigning<T>(unsigned: UnsignedPacket<T>): string {
  const sorted = Object.fromEntries(
    Object.keys(unsigned)
      .sort()
      .map((k) => [k, (unsigned as Record<string, unknown>)[k]]),
  );
  return JSON.stringify(sorted);
}

/**
 * Creates and signs a typed packet.
 */
export async function createPacket<K extends MessageType>(
  type: K,
  senderId: string,
  payload: PayloadMap[K],
  privateKey: CryptoKey,
): Promise<Packet<PayloadMap[K]>> {
  const unsigned: UnsignedPacket<PayloadMap[K]> = {
    protocolVersion: PROTOCOL_VERSION,
    messageType: type,
    messageId: generateId(),
    senderId,
    timestamp: Date.now(),
    payload,
  };
  const signature = await sign(privateKey, serialiseForSigning(unsigned));
  return { ...unsigned, signature };
}

/**
 * Verifies a packet's signature against the sender's public key (base64 SPKI).
 * Returns true if valid, false otherwise — never throws.
 */
export async function verifyPacket<T>(packet: Packet<T>, senderPublicKeyB64: string): Promise<boolean> {
  try {
    const { signature, ...unsigned } = packet;
    const publicKey = await importPublicKey(senderPublicKeyB64);
    return verify(publicKey, signature, serialiseForSigning(unsigned as UnsignedPacket<T>));
  } catch {
    return false;
  }
}

/**
 * Parses a raw JSON value into a typed Packet.
 * Returns null if the value is not a valid packet shape.
 */
export function parsePacket<T = unknown>(raw: unknown): Packet<T> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Record<string, unknown>;
  if (
    typeof p.protocolVersion !== 'number' ||
    typeof p.messageType !== 'string' ||
    typeof p.messageId !== 'string' ||
    typeof p.senderId !== 'string' ||
    typeof p.timestamp !== 'number' ||
    p.payload === undefined ||
    typeof p.signature !== 'string'
  ) {
    return null;
  }
  if (!Object.values(MessageType).includes(p.messageType as MessageType)) return null;
  return p as unknown as Packet<T>;
}

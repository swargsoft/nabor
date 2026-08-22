import { PROTOCOL_VERSION } from '@/types/protocol';
import type { Packet, ProfileResponsePayload, MediaResponsePayload, MessageSyncResponsePayload, MessagePayload, MessageSyncRequestPayload } from '@/types/protocol';
import { createLogger } from '@/utils/logger';

const logger = createLogger('SecurityGuard');

// ─── Limits ───────────────────────────────────────────────────────────────────

export const LIMITS = {
  MAX_TIMESTAMP_SKEW_MS:    5 * 60 * 1000,   // 5 minutes
  MAX_PACKET_PAYLOAD_BYTES: 512 * 1024,       // 512 KB serialised payload
  MAX_MEDIA_DATA_BYTES:     5 * 1024 * 1024,  // 5 MB base64 string
  MAX_MESSAGE_TEXT_CHARS:   2_000,
  MAX_DISPLAY_NAME_CHARS:   40,
  MAX_BIO_CHARS:            300,
  MAX_INTERESTS:            20,
  MAX_INTEREST_CHARS:       50,
  MAX_PHOTO_IDS:            10,
  MAX_KNOWN_MESSAGE_IDS:    500,
  MAX_SYNC_MESSAGES:        100,
  MAX_ID_CHARS:             128,
} as const;

// ─── Result type ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

// ─── Packet-level validation ──────────────────────────────────────────────────

/**
 * Validates the envelope of any incoming packet before dispatching.
 * Checks: protocol version, timestamp skew, ID lengths, payload size.
 */
export function validatePacket(packet: Packet<unknown>): ValidationResult {
  if (packet.protocolVersion !== PROTOCOL_VERSION) {
    return fail(`Unsupported protocol version: ${packet.protocolVersion}`);
  }

  const skew = Math.abs(Date.now() - packet.timestamp);
  if (skew > LIMITS.MAX_TIMESTAMP_SKEW_MS) {
    return fail(`Timestamp skew too large: ${skew}ms`);
  }

  if (!packet.messageId || packet.messageId.length > LIMITS.MAX_ID_CHARS) {
    return fail('Invalid messageId');
  }

  if (!packet.senderId || packet.senderId.length > LIMITS.MAX_ID_CHARS) {
    return fail('Invalid senderId');
  }

  const payloadSize = JSON.stringify(packet.payload).length;
  if (payloadSize > LIMITS.MAX_PACKET_PAYLOAD_BYTES) {
    return fail(`Payload too large: ${payloadSize} bytes`);
  }

  return { valid: true };
}

// ─── Payload-level validators ─────────────────────────────────────────────────

export function validateMessagePayload(payload: MessagePayload): ValidationResult {
  if (!payload.messageId || payload.messageId.length > LIMITS.MAX_ID_CHARS) {
    return fail('Invalid messageId in payload');
  }
  if (!payload.conversationId || payload.conversationId.length > LIMITS.MAX_ID_CHARS) {
    return fail('Invalid conversationId in payload');
  }
  if (typeof payload.text !== 'string' || payload.text.length === 0) {
    return fail('Message text is empty');
  }
  if (payload.text.length > LIMITS.MAX_MESSAGE_TEXT_CHARS) {
    return fail(`Message text too long: ${payload.text.length} chars`);
  }
  return { valid: true };
}

export function validateProfileResponsePayload(payload: ProfileResponsePayload): ValidationResult {
  if (typeof payload.displayName !== 'string' || payload.displayName.length === 0) {
    return fail('Missing displayName');
  }
  if (payload.displayName.length > LIMITS.MAX_DISPLAY_NAME_CHARS) {
    return fail(`displayName too long: ${payload.displayName.length} chars`);
  }
  if (typeof payload.bio === 'string' && payload.bio.length > LIMITS.MAX_BIO_CHARS) {
    return fail(`bio too long: ${payload.bio.length} chars`);
  }
  if (!Array.isArray(payload.interests) || payload.interests.length > LIMITS.MAX_INTERESTS) {
    return fail(`Too many interests: ${(payload.interests as unknown[])?.length}`);
  }
  for (const interest of payload.interests) {
    if (typeof interest !== 'string' || interest.length > LIMITS.MAX_INTEREST_CHARS) {
      return fail(`Interest too long or invalid`);
    }
  }
  if (!Array.isArray(payload.photoIds) || payload.photoIds.length > LIMITS.MAX_PHOTO_IDS) {
    return fail(`Too many photoIds: ${(payload.photoIds as unknown[])?.length}`);
  }
  if (typeof payload.age !== 'number' || payload.age < 18 || payload.age > 120) {
    return fail(`Invalid age: ${payload.age}`);
  }
  return { valid: true };
}

export function validateMediaResponsePayload(payload: MediaResponsePayload): ValidationResult {
  if (typeof payload.data !== 'string' || payload.data.length === 0) {
    return fail('Missing media data');
  }
  if (payload.data.length > LIMITS.MAX_MEDIA_DATA_BYTES) {
    return fail(`Media data too large: ${payload.data.length} bytes`);
  }
  if (typeof payload.mimeType !== 'string' || !payload.mimeType.startsWith('image/')) {
    return fail(`Invalid mimeType: ${payload.mimeType}`);
  }
  return { valid: true };
}

export function validateSyncResponsePayload(payload: MessageSyncResponsePayload): ValidationResult {
  if (!Array.isArray(payload.messages)) {
    return fail('messages must be an array');
  }
  if (payload.messages.length > LIMITS.MAX_SYNC_MESSAGES) {
    return fail(`Too many sync messages: ${payload.messages.length}`);
  }
  for (const msg of payload.messages) {
    if (typeof msg.text !== 'string' || msg.text.length > LIMITS.MAX_MESSAGE_TEXT_CHARS) {
      return fail('Sync message text too long or invalid');
    }
    if (typeof msg.senderId !== 'string' || msg.senderId.length > LIMITS.MAX_ID_CHARS) {
      return fail('Invalid senderId in sync message');
    }
  }
  return { valid: true };
}

export function validateSyncRequestPayload(payload: MessageSyncRequestPayload): ValidationResult {
  if (!Array.isArray(payload.knownMessageIds)) {
    return fail('knownMessageIds must be an array');
  }
  if (payload.knownMessageIds.length > LIMITS.MAX_KNOWN_MESSAGE_IDS) {
    return fail(`Too many knownMessageIds: ${payload.knownMessageIds.length}`);
  }
  return { valid: true };
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function fail(reason: string): ValidationResult {
  logger.warn('Validation failed', { reason });
  return { valid: false, reason };
}

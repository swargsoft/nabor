// ─── Protocol Version ─────────────────────────────────────────────────────────

export const PROTOCOL_VERSION = 1;

// ─── Message Types ────────────────────────────────────────────────────────────

export enum MessageType {
  // Handshake
  HELLO = 'HELLO',
  PING = 'PING',
  PONG = 'PONG',

  // Profile exchange
  PROFILE_REQUEST = 'PROFILE_REQUEST',
  PROFILE_RESPONSE = 'PROFILE_RESPONSE',

  // Media exchange
  MEDIA_REQUEST = 'MEDIA_REQUEST',
  MEDIA_RESPONSE = 'MEDIA_RESPONSE',

  // Discovery actions
  LIKE = 'LIKE',
  PASS = 'PASS',
  MATCH = 'MATCH',

  // Messaging
  MESSAGE = 'MESSAGE',
  MESSAGE_ACK = 'MESSAGE_ACK',

  // Multi-device pairing
  DEVICE_PAIR_REQUEST = 'DEVICE_PAIR_REQUEST',
  DEVICE_PAIR_RESPONSE = 'DEVICE_PAIR_RESPONSE',

  // Message synchronization
  MESSAGE_SYNC_REQUEST = 'MESSAGE_SYNC_REQUEST',
  MESSAGE_SYNC_RESPONSE = 'MESSAGE_SYNC_RESPONSE',
}

// ─── Payload Types ────────────────────────────────────────────────────────────

export interface HelloPayload {
  publicKey: string;       // sender's master public key (base64 SPKI)
  deviceId: string;
  displayName?: string;
}

export interface PingPayload {
  nonce: string;
}

export interface PongPayload {
  nonce: string;           // echoes the ping nonce
}

export interface ProfileRequestPayload {
  requestId: string;
}

export interface ProfileResponsePayload {
  requestId: string;
  accountId: string;
  displayName: string;
  age: number;
  bio: string;
  gender: string;
  interests: string[];
  photoIds: string[];
}

export interface MediaRequestPayload {
  mediaId: string;
  thumbnail: boolean;
}

export interface MediaResponsePayload {
  mediaId: string;
  thumbnail: boolean;
  data: string;            // base64-encoded image data
  mimeType: string;
}

export interface LikePayload {
  targetId: string;        // accountId of the liked peer
}

export interface PassPayload {
  targetId: string;
}

export interface MatchPayload {
  targetId: string;
  conversationId: string;
}

export interface MessagePayload {
  conversationId: string;
  messageId: string;
  text: string;
}

export interface MessageAckPayload {
  messageId: string;
  status: 'delivered' | 'read';
}

export interface DevicePairRequestPayload {
  deviceId: string;
  devicePublicKey: string; // base64 SPKI
  deviceName: string;
  nonce: string;
}

export interface MessageSyncRequestPayload {
  conversationId: string;
  /** IDs of messages the requester already has — peer sends only what's missing. */
  knownMessageIds: string[];
}

export interface SyncMessage {
  messageId: string;
  senderId: string;
  text: string;
  createdAt: number;
}

export interface MessageSyncResponsePayload {
  conversationId: string;
  messages: SyncMessage[];
}

export interface DevicePairResponsePayload {
  deviceId: string;
  nonce: string;
  accepted: boolean;
}

// ─── Payload map (MessageType → payload type) ─────────────────────────────────

export interface PayloadMap {
  [MessageType.HELLO]: HelloPayload;
  [MessageType.PING]: PingPayload;
  [MessageType.PONG]: PongPayload;
  [MessageType.PROFILE_REQUEST]: ProfileRequestPayload;
  [MessageType.PROFILE_RESPONSE]: ProfileResponsePayload;
  [MessageType.MEDIA_REQUEST]: MediaRequestPayload;
  [MessageType.MEDIA_RESPONSE]: MediaResponsePayload;
  [MessageType.LIKE]: LikePayload;
  [MessageType.PASS]: PassPayload;
  [MessageType.MATCH]: MatchPayload;
  [MessageType.MESSAGE]: MessagePayload;
  [MessageType.MESSAGE_ACK]: MessageAckPayload;
  [MessageType.DEVICE_PAIR_REQUEST]: DevicePairRequestPayload;
  [MessageType.DEVICE_PAIR_RESPONSE]: DevicePairResponsePayload;
  [MessageType.MESSAGE_SYNC_REQUEST]: MessageSyncRequestPayload;
  [MessageType.MESSAGE_SYNC_RESPONSE]: MessageSyncResponsePayload;
}

// ─── Packet ───────────────────────────────────────────────────────────────────

/**
 * The canonical wire format for all peer-to-peer messages.
 * `signature` covers everything except itself: sign(JSON(packet without signature)).
 */
export interface Packet<T = unknown> {
  protocolVersion: number;
  messageType: MessageType;
  messageId: string;       // random UUID per message
  senderId: string;        // accountId of sender
  timestamp: number;       // Unix ms
  payload: T;
  signature: string;       // base64 ECDSA-P256 signature
}

/** Unsigned packet — used as the signing input. */
export type UnsignedPacket<T = unknown> = Omit<Packet<T>, 'signature'>;

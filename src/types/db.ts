// ─── Identity ────────────────────────────────────────────────────────────────

export interface Identity {
  id: string;           // accountId (primary key)
  publicKey: string;    // base64 encoded
  privateKey: string;   // base64 encoded (encrypted at rest in future stages)
  createdAt: number;
}

// ─── Device ──────────────────────────────────────────────────────────────────

export interface Device {
  id: string;           // deviceId (primary key)
  accountId: string;
  publicKey: string;
  name: string;
  createdAt: number;
  lastSeenAt: number;
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export type Gender = 'man' | 'woman' | 'nonbinary' | 'other';

export interface Profile {
  id: string;           // accountId (primary key)
  displayName: string;
  age: number;
  bio: string;
  gender: Gender;
  interests: string[];
  photoIds: string[];
  locationEnabled: boolean;
  updatedAt: number;
}

// ─── Match ───────────────────────────────────────────────────────────────────

export type MatchStatus = 'pending' | 'matched' | 'rejected';

export interface Match {
  id: string;
  accountId: string;    // local user
  peerId: string;       // remote peer
  status: MatchStatus;
  createdAt: number;
  updatedAt: number;
}

// ─── Conversation ─────────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  matchId: string;
  peerId: string;
  /** Cached remote display name so Matches/Chat still have a name after discovery cache is cleared. */
  peerName?: string;
  lastMessageAt: number;
  createdAt: number;
}

// ─── Message ─────────────────────────────────────────────────────────────────

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  status: MessageStatus;
  createdAt: number;
}

// ─── Media ───────────────────────────────────────────────────────────────────

export interface Media {
  id: string;
  ownerId: string;
  hash: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  cacheKey: string;
  createdAt: number;
  lastAccessedAt: number;
}

// ─── Location ────────────────────────────────────────────────────────────────

export interface Location {
  id: string;           // accountId
  latitude: number;
  longitude: number;
  h3Index: string;
  accuracy: number;
  updatedAt: number;
}

// ─── Discovery ───────────────────────────────────────────────────────────────

export type DiscoveryStatus = 'seen' | 'liked' | 'passed';

export interface Discovery {
  id: string;
  peerId: string;
  h3Index: string;
  status: DiscoveryStatus;
  seenAt: number;
}

// ─── Blocked Peer ────────────────────────────────────────────────────────────

export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'fake' | 'other';

export interface BlockedPeer {
  id: string;           // peerId (primary key)
  accountId: string;    // local user who blocked
  reason?: ReportReason;
  note?: string;
  blockedAt: number;
}

// ─── ICE / TURN ──────────────────────────────────────────────────────────────

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export interface Settings {
  id: 'local';          // singleton row
  ageMin: number;
  ageMax: number;
  radiusKm: number;
  genderPreference: Gender[];
  notificationsEnabled: boolean;
  theme: 'dark' | 'light' | 'system';
  turnServers: IceServerConfig[];   // empty = STUN-only
  updatedAt: number;
}

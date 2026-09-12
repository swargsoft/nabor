import type { JsonValue } from '@trystero-p2p/core';

export interface Peer {
  id: string;
  roomId: string;
}

/**
 * Pluggable discovery strategy interface.
 * The application layer depends only on this contract — not on Trystero, Nostr, or any
 * specific transport. Swap strategies without changing any service code.
 */
export interface DiscoveryStrategy {
  /** Join a discovery room and start receiving peers and data. */
  join(room: string): Promise<void>;

  /** Leave a discovery room. */
  leave(room: string): Promise<void>;

  /** Announce data to all peers in a room (or a specific peer). */
  announce(room: string, data: JsonValue, targetPeerId?: string): Promise<void>;

  /** Return the currently known peers in a room. */
  discover(room: string): Promise<Peer[]>;

  /** Register a handler for incoming data from any peer in any room. */
  onData(handler: (data: JsonValue, peerId: string, roomId: string) => void): () => void;

  /** Register a handler fired when a peer joins any room. */
  onPeerJoin(handler: (peerId: string, roomId: string) => void): () => void;

  /** Register a handler fired when a peer leaves any room. */
  onPeerLeave(handler: (peerId: string) => void): () => void;

  /** Leave all rooms and clean up. */
  leaveAll(): Promise<void>;

  /** Returns IDs of all currently joined rooms. */
  getRoomIds(): string[];

  /** Returns the number of currently connected peers across all rooms. */
  getPeerCount(): number;

  /** Returns rooms currently shared with a peer, when supported by the strategy. */
  getRoomsForPeer?(peerId: string): string[];
}

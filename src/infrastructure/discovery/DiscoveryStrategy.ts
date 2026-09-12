import type { JsonValue } from '@trystero-p2p/core';

export interface Peer { id: string; roomId: string; }

export interface DiscoveryStrategy {
  join(room: string): Promise<void>;
  leave(room: string): Promise<void>;
  announce(room: string, data: JsonValue, targetPeerId?: string): Promise<void>;
  discover(room: string): Promise<Peer[]>;
  onData(handler: (data: JsonValue, peerId: string, roomId: string) => void): () => void;
  onPeerJoin(handler: (peerId: string, roomId: string) => void): () => void;
  onPeerLeave(handler: (peerId: string, roomId: string) => void): () => void;
  leaveAll(): Promise<void>;
  getRoomIds(): string[];
  getPeerCount(): number;
  getRoomForPeer?(peerId: string): string | undefined;
}

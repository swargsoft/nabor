import { SettingsRepository } from '@/repositories/SettingsRepository';
import type { IceServerConfig } from '@/types/db';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ConnectivityService');

// Default public STUN servers — always included
const DEFAULT_STUN: IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const PROBE_TIMEOUT_MS = 5_000;

export type ConnectivityType = 'host' | 'srflx' | 'relay' | 'none';

export interface ConnectivityResult {
  reachable: boolean;
  type: ConnectivityType;   // best candidate type gathered
  rttMs: number | null;     // round-trip estimate from STUN binding, null if unreachable
  turnRequired: boolean;    // true only when no srflx candidate gathered
}

export const ConnectivityService = {
  /**
   * Returns the merged ICE server list: default STUN + any configured TURN servers.
   * Trystero / RTCPeerConnection should use this list.
   */
  async getIceServers(): Promise<IceServerConfig[]> {
    const settings = await SettingsRepository.get();
    return [...DEFAULT_STUN, ...settings.turnServers];
  },

  /**
   * Probes STUN reachability by creating a throwaway RTCPeerConnection,
   * gathering ICE candidates, and inspecting the best candidate type.
   *
   * Returns quickly (within PROBE_TIMEOUT_MS) even if the network is slow.
   */
  async probe(): Promise<ConnectivityResult> {
    const iceServers = await this.getIceServers();

    return new Promise<ConnectivityResult>((resolve) => {
      let best: ConnectivityType = 'none';
      let resolved = false;
      let pc: RTCPeerConnection | null = null;

      const finish = (rttMs: number | null = null) => {
        if (resolved) return;
        resolved = true;
        pc?.close();
        const reachable = best !== 'none';
        const turnRequired = reachable && best !== 'srflx' && best !== 'relay';
        logger.info('Connectivity probe complete', { best, reachable, turnRequired });
        resolve({ reachable, type: best, rttMs, turnRequired });
      };

      const timer = setTimeout(() => finish(null), PROBE_TIMEOUT_MS);

      try {
        pc = new RTCPeerConnection({ iceServers: iceServers as RTCIceServer[] });

        // A data channel is required to trigger ICE gathering
        pc.createDataChannel('probe');

        pc.onicecandidate = (e) => {
          if (!e.candidate) {
            // Gathering complete
            clearTimeout(timer);
            finish(null);
            return;
          }
          const type = e.candidate.type as ConnectivityType;
          // Rank: relay > srflx > host > none
          const rank: Record<ConnectivityType, number> = { relay: 3, srflx: 2, host: 1, none: 0 };
          if (rank[type] > rank[best]) best = type;
        };

        pc.createOffer()
          .then((offer) => pc!.setLocalDescription(offer))
          .catch(() => { clearTimeout(timer); finish(null); });

      } catch {
        clearTimeout(timer);
        finish(null);
      }
    });
  },

  /**
   * Adds a TURN server to settings. Idempotent — won't add duplicates by URL.
   */
  async addTurnServer(server: IceServerConfig): Promise<void> {
    const settings = await SettingsRepository.get();
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    const existing = settings.turnServers.flatMap((s) =>
      Array.isArray(s.urls) ? s.urls : [s.urls],
    );
    if (urls.every((u) => existing.includes(u))) return;
    await SettingsRepository.save({ turnServers: [...settings.turnServers, server] });
    logger.info('TURN server added', { urls });
  },

  /**
   * Removes all configured TURN servers, reverting to STUN-only.
   */
  async clearTurnServers(): Promise<void> {
    await SettingsRepository.save({ turnServers: [] });
    logger.info('TURN servers cleared');
  },
};

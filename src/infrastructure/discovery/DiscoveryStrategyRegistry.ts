import { discoveryTransport } from '@/infrastructure/trystero/DiscoveryTransport';
import { WebTorrentStrategy } from './WebTorrentStrategy';
import type { DiscoveryStrategy } from './DiscoveryStrategy';
import { createLogger } from '@/utils/logger';

const logger = createLogger('DiscoveryStrategyRegistry');

/**
 * Holds the active DiscoveryStrategy singleton.
 * Defaults to WebTorrentStrategy. Call setStrategy() to swap at runtime.
 *
 * Usage:
 *   // Use default (WebTorrent)
 *   const strategy = DiscoveryStrategyRegistry.get();
 *
 *   // Swap to a custom strategy (e.g. Nostr)
 *   DiscoveryStrategyRegistry.set(new NostrStrategy(...));
 */
export const DiscoveryStrategyRegistry = {
  _strategy: null as DiscoveryStrategy | null,

  /** Returns the active strategy, initialising WebTorrent as default on first call. */
  get(): DiscoveryStrategy {
    if (!this._strategy) {
      this._strategy = new WebTorrentStrategy(discoveryTransport);
      logger.info('Initialised default strategy: WebTorrent');
    }
    return this._strategy;
  },

  /**
   * Swaps the active strategy. Leaves all rooms on the old strategy before switching.
   * Safe to call at any time — the app will use the new strategy for subsequent joins.
   */
  async set(strategy: DiscoveryStrategy): Promise<void> {
    if (this._strategy) {
      await this._strategy.leaveAll();
    }
    this._strategy = strategy;
    logger.info('Discovery strategy changed', { strategy: strategy.constructor.name });
  },

  /** Resets to the default WebTorrent strategy. Used in tests. */
  reset(): void {
    this._strategy = null;
  },
};

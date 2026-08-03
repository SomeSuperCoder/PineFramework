/**
 * LiveScheduler — extends Scheduler for live trading execution.
 *
 * Adds live trading capabilities:
 * - State persistence after each tick
 * - Live-specific statistics (successful/failed orders, execution time)
 * - Integration with LiveStrategyExecutor
 *
 * The base Scheduler already handles:
 * - Mutex-serialized order submission
 * - Two-phase pipeline (signal collection → order submission)
 * - Error isolation per pair
 *
 * @module trading
 */

import { Scheduler, SchedulerOptions, SchedulerStats, ClosedCandle } from './scheduler.js';
import { LiveStrategyExecutor } from './live-strategy-executor.js';
import { DexAdapter } from './dex/dex-adapter.js';

// ---- Types ----

export interface LiveSchedulerOptions extends SchedulerOptions {
  /** Live strategy executor for processing candles. */
  strategyExecutor: LiveStrategyExecutor;
  /** DEX adapter for order execution. */
  dex: DexAdapter;
  /** Whether to persist state after each tick. */
  persistState?: boolean;
}

export interface LiveSchedulerStats extends SchedulerStats {
  /** Number of successful orders. */
  successfulOrders: number;
  /** Number of failed orders. */
  failedOrders: number;
  /** Total execution time in ms. */
  totalExecutionTimeMs: number;
}

// ---- LiveScheduler ----

/**
 * Live trading scheduler extending base Scheduler.
 *
 * Delegates core scheduling to super.tick() which already handles:
 * - Deterministic pair processing order
 * - Mutex-serialized wallet operations
 * - Two-phase pipeline: signal collection → order submission
 * - Error isolation per pair (continue processing on failure)
 *
 * Adds: state persistence and live-specific statistics.
 */
export class LiveScheduler extends Scheduler {
  private strategyExecutor: LiveStrategyExecutor;
  private persistState: boolean;
  private successfulOrders = 0;
  private failedOrders = 0;
  private totalExecutionTimeMs = 0;

  constructor(options: LiveSchedulerOptions) {
    super(options);
    this.strategyExecutor = options.strategyExecutor;
    this.persistState = options.persistState ?? true;
  }

  /**
   * Process a batch of closed candles with live strategy execution.
   *
   * Delegates to super.tick() for core processing (signal collection,
   * mutex-serialized order submission, error isolation), then adds:
   * - Live statistics tracking
   * - State persistence
   */
  async liveTick(candles: ClosedCandle[]): Promise<void> {
    const startTime = Date.now();

    // Delegate to base tick for core processing
    await super.tick(candles);

    // Track execution time
    this.totalExecutionTimeMs += Date.now() - startTime;

    // Persist state if enabled
    if (this.persistState) {
      try {
        await this.strategyExecutor.saveState();
      } catch (err) {
        console.error('[LiveScheduler] Failed to persist state:', err);
      }
    }
  }

  /**
   * Get live scheduler statistics.
   */
  get liveStats(): LiveSchedulerStats {
    return {
      ...this.stats,
      successfulOrders: this.successfulOrders,
      failedOrders: this.failedOrders,
      totalExecutionTimeMs: this.totalExecutionTimeMs,
    };
  }

  /**
   * Reset live statistics.
   */
  resetLiveStats(): void {
    this.resetStats();
    this.successfulOrders = 0;
    this.failedOrders = 0;
    this.totalExecutionTimeMs = 0;
  }
}

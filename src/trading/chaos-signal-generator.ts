/**
 * ChaosSignalGenerator — generates random trading signals for stress testing.
 *
 * When chaos mode is active, this generator replaces normal strategy execution
 * by producing random long/short/exit signals on every candle close.
 *
 * @module trading
 */

import type { PineLogger } from '../utils/logger/types.js';

/** The three possible chaos signals. */
export type ChaosAction = 'long' | 'short' | 'exit';

/** A generated chaos signal with metadata. */
export interface ChaosSignal {
  /** Randomly selected action. */
  action: ChaosAction;
  /** Position size as a fraction of equity (always 0.1 = 10%). */
  sizeFraction: number;
  /** Current equity at time of signal generation. */
  equity: number;
  /** Timestamp of signal generation. */
  timestamp: number;
}

/**
 * Generates random trading signals for chaos testing.
 *
 * Features:
 * - Uniform random selection among long/short/exit (1/3 each)
 * - Fixed 10% equity position sizing
 * - Structured logging of all generated signals
 */
export class ChaosSignalGenerator {
  private readonly logger: PineLogger;
  private signalCount = 0;

  constructor(logger: PineLogger) {
    this.logger = logger;
  }

  /**
   * Generate a random trading signal.
   *
   * @param equity - Current portfolio equity in USDC (smallest units)
   * @param timestamp - Current candle timestamp
   * @returns A chaos signal with random action and 10% equity sizing
   */
  generate(equity: number, timestamp: number): ChaosSignal {
    const actions: ChaosAction[] = ['long', 'short', 'exit'];
    const action = actions[Math.floor(Math.random() * actions.length)];

    this.signalCount++;

    const signal: ChaosSignal = {
      action,
      sizeFraction: 0.1, // Always 10% of equity
      equity,
      timestamp,
    };

    this.logger.info('chaos.signal', {
      signalNumber: this.signalCount,
      action: signal.action,
      equity: signal.equity,
      sizeFraction: signal.sizeFraction,
      ts: signal.timestamp,
    });

    return signal;
  }

  /**
   * Get total number of signals generated since construction.
   */
  getSignalCount(): number {
    return this.signalCount;
  }
}

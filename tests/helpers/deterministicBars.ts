/**
 * Deterministic bar fixture generator for reproducible tests.
 *
 * Uses a seeded LCG (Lehmer) random number generator so that the same seed
 * always produces identical OHLCV data.  Three trend shapes are supported:
 *
 * - `'sine-wave'`  — cyclic up/down pattern (good for pivot detection tests)
 * - `'linear-up'`  — monotonic upward drift (good for trend-following tests)
 * - `'flat'`       — mean-reverting around a constant (good for range-bound tests)
 */

/** Reproducible pseudo-random number generator (Lehmer / Park-Miller LCG). */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0; // force unsigned 32-bit
    if (this.state === 0) this.state = 1;
  }

  /** Returns a value in [0, 1). */
  next(): number {
    this.state = (this.state * 16807) % 2147483647;
    return this.state / 2147483647;
  }

  /** Returns the current raw state (useful for debugging / snapshots). */
  getState(): number {
    return this.state;
  }
}

export type TrendShape = 'sine-wave' | 'linear-up' | 'flat';

export interface Bar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CreateTrendBarsOptions {
  count: number;
  seed?: number;
  trend?: TrendShape;
  startPrice?: number;
  startTime?: number;
  /** Volatility as a fraction of price (default 0.02). */
  volatility?: number;
  /** Volume base value (default 1000). */
  baseVolume?: number;
}

/**
 * Create a reproducible array of OHLCV bars.
 *
 * @example
 * ```ts
 * const bars = createTrendBars({ count: 500, seed: 42, trend: 'sine-wave' });
 * ```
 */
export function createTrendBars(options: CreateTrendBarsOptions): Bar[] {
  const {
    count,
    seed = 42,
    trend = 'sine-wave',
    startPrice = 100,
    startTime = 1700000000000,
    volatility = 0.02,
    baseVolume = 1000,
  } = options;

  const rng = new SeededRandom(seed);
  const bars: Bar[] = [];

  for (let i = 0; i < count; i++) {
    // --- trend component ---
    let trendPrice: number;
    switch (trend) {
      case 'sine-wave': {
        const phase = (i % 30) / 30;
        trendPrice = startPrice + 10 * Math.sin(phase * Math.PI * 2) + (i / count) * 5;
        break;
      }
      case 'linear-up': {
        trendPrice = startPrice + (i / count) * 20;
        break;
      }
      case 'flat': {
        trendPrice = startPrice + (rng.next() - 0.5) * 2; // small noise around startPrice
        break;
      }
      default:
        trendPrice = startPrice;
    }

    const open = trendPrice + (rng.next() - 0.5) * trendPrice * volatility;
    const close = trendPrice + (rng.next() - 0.5) * trendPrice * volatility;
    const high = Math.max(open, close) + rng.next() * trendPrice * volatility * 0.5;
    const low = Math.min(open, close) - rng.next() * trendPrice * volatility * 0.5;
    const volume = Math.floor(baseVolume + rng.next() * baseVolume);

    bars.push({
      timestamp: startTime + i * 3600000, // 1-hour intervals
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
    });
  }

  return bars;
}

/**
 * Create a prepend variant: returns `prependCount` older bars + the original `bars`
 * so the new array is larger and the original bars shift right.
 */
export function prependBars(
  originalBars: Bar[],
  prependCount: number,
  seedOffset: number = 0,
): Bar[] {
  const rng = new SeededRandom(9999 + seedOffset);
  const startTime = originalBars[0]!.timestamp - prependCount * 3600000;
  const olderBars: Bar[] = [];

  for (let i = 0; i < prependCount; i++) {
    const open = 90 + rng.next() * 20;
    const close = 90 + rng.next() * 20;
    const high = Math.max(open, close) + rng.next() * 5;
    const low = Math.min(open, close) - rng.next() * 5;
    olderBars.push({
      timestamp: startTime + i * 3600000,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.floor(1000 + rng.next() * 1000),
    });
  }

  return [...olderBars, ...originalBars];
}

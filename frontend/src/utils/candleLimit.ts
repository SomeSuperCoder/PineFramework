import { timeframeToMinutes } from 'pine-framework';

/** Maximum number of candles allowed in a single backtest run. */
export const SAFE_AMOUNT_OF_CANDLES = 1500;

const MINUTES_IN_DAY = 24 * 60;
const DEFAULT_BARS_PER_DAY = 24; // assumes 60m timeframe as fallback

/**
 * Returns the number of candles that fit in one day for a given timeframe.
 *
 * For minute-based timeframes: `MINUTES_IN_DAY / timeframeInMinutes`
 * Special cases: 'D' → 1, 'W' → 1/7
 * Falls back to `DEFAULT_BARS_PER_DAY` for unrecognized timeframes.
 */
export function candlesPerDay(timeframe: string): number {
  if (timeframe === 'D') return 1;
  if (timeframe === 'W') return 1 / 7;

  try {
    const minutes = timeframeToMinutes(timeframe);
    return MINUTES_IN_DAY / minutes;
  } catch {
    // Unrecognized timeframe — use a safe default
    return DEFAULT_BARS_PER_DAY;
  }
}

/**
 * Returns the maximum safe number of full days for the given timeframe
 * without exceeding `SAFE_AMOUNT_OF_CANDLES`.
 */
export function maxSafeDays(timeframe: string): number {
  const cpd = candlesPerDay(timeframe);
  return Math.floor(SAFE_AMOUNT_OF_CANDLES / cpd);
}

/**
 * Estimates the number of bars that would be generated for the given
 * timeframe and number of days.
 */
export function estimateBars(timeframe: string, days: number): number {
  const cpd = candlesPerDay(timeframe);
  return Math.ceil(cpd * days);
}

/**
 * Returns the min/max slider bounds for the "days back" input.
 *
 * - `max`: the maximum safe days (`maxSafeDays`)
 * - `min`: 30% of maximum, rounded up, ensuring at least 1
 */
export function sliderBounds(timeframe: string): { min: number; max: number } {
  const max = maxSafeDays(timeframe);
  const min = Math.max(1, Math.ceil(0.3 * max));
  return { min, max };
}

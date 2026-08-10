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

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EPOCH_MS = Date.parse('1970-01-01T00:00:00Z');

export type DateRangeValidationResult =
  | { valid: true; estimatedBars: number }
  | { valid: false; message: string };

/**
 * Validates an explicit (start/end) date range for a backtest run.
 *
 * Guardrails, in check order:
 * 1. both dates are present and parseable
 * 2. start <= end
 * 3. end is not after today
 * 4. the range spans at least one full day
 * 5. the estimated bar count does not exceed `SAFE_AMOUNT_OF_CANDLES`
 * 6. calendar bounds: neither date is before the Unix epoch (1970-01-01);
 *    future dates are already rejected by check 3
 *
 * Returns a typed result the panel/hook can surface directly to the user.
 * Dates are `YYYY-MM-DD` strings; they are compared at UTC midnight so the
 * check is timezone-independent.
 */
export function validateDateRange(
  startDate: string,
  endDate: string,
  timeframe: string,
): DateRangeValidationResult {
  const startMs = Date.parse(`${startDate}T00:00:00Z`);
  const endMs = Date.parse(`${endDate}T00:00:00Z`);

  if (!startDate || !endDate || Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return { valid: false, message: 'Select both a start and an end date.' };
  }

  if (startMs > endMs) {
    return { valid: false, message: 'Start date must be on or before the end date.' };
  }

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`;
  if (endMs > Date.parse(`${todayStr}T00:00:00Z`)) {
    return { valid: false, message: 'End date cannot be in the future.' };
  }

  const days = Math.ceil((endMs - startMs) / MS_PER_DAY);
  if (days < 1) {
    return { valid: false, message: 'The range must span at least 1 day.' };
  }

  const estimatedBars = estimateBars(timeframe, days);
  if (estimatedBars > SAFE_AMOUNT_OF_CANDLES) {
    return {
      valid: false,
      message: `This range would load more than ${SAFE_AMOUNT_OF_CANDLES} candles. Shorten it or switch to a higher timeframe.`,
    };
  }

  // Rule 7: calendar bounds. Reject dates before the Unix epoch on either
  // bound. The end<=today check (rule 3) already rejects future dates, so
  // this guard only needs the before-epoch case; the message keeps the full
  // copy from the guardrail spec, with today substituted. Placed after the
  // bar-count check to preserve the spec's guardrail order.
  if (startMs < EPOCH_MS || endMs < EPOCH_MS) {
    return {
      valid: false,
      message: `Date out of range. Choose a date between 1970-01-01 and ${todayStr}.`,
    };
  }

  return { valid: true, estimatedBars };
}

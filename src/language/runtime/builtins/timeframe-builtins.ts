/**
 * Pine v6 `timeframe.*` namespace builtins.
 *
 * The timeframe namespace exposes the CURRENT CHART TIMEFRAME of the run.
 * The value is engine-level state (`ExecutionEngine.timeframe`), resolved at
 * construction in this precedence order:
 *   1. runtime options (constructor third arg) — the runner-provided chart
 *      resolution (the backend CLI forwards its --timeframe here, DEFECT 2)
 *   2. strategy() declaration arg `timeframe="..."` — the script-level
 *      fallback wired in ExecutionEngine.initializeStrategy
 *   3. undefined — every member resolves to NA (no-tf behavior, non-breaking)
 *
 * WHY closures read `eng.timeframe` at invocation time instead of capturing
 * it: registerBuiltins() runs in the constructor BEFORE initializeStrategy()
 * sets the script-declared fallback. Lazy reads make the declaration fallback
 * visible to every member without re-registration.
 *
 * Member access — one registration, two access paths:
 *   - CALL path `timeframe.in_seconds()` resolves via the MemberExpression
 *     branch of executeCallExpression: eng.builtins.get('timeframe.in_seconds').
 *   - PROPERTY path `timeframe.period` resolves via the `timeframe` branch of
 *     executeMemberExpression, which invokes the same registered thunk.
 * Every member is registered as a zero-arg thunk so the builtins Map stays
 * function-homogeneous (Map<string, (...args) => PineValue>).
 */
import type { ExecutionEngine } from '../execution-engine.js';
import { NA, type PineValue } from '../../types/na.js';

/** Parsed representation of a Pine timeframe string. */
export interface TimeframeParts {
  /** Numeric component of the timeframe (1 for "1", 5 for "5", 1 for "D"/"W"/"M"). */
  multiplier: number;
  /** Unit class: seconds ('S'), minutes ('m'), or daily/weekly/monthly. */
  unit: 'S' | 'm' | 'D' | 'W' | 'M';
  /** Seconds per bar at this timeframe. */
  seconds: number;
}

const UNIT_SECONDS: Record<TimeframeParts['unit'], number> = {
  S: 1,
  m: 60,
  // Pine models a month as 30 days.
  D: 86400,
  W: 604800,
  M: 2592000,
};

/**
 * Parse a Pine timeframe string into its multiplier/unit/seconds parts.
 * Supported forms: bare minutes ("1", "5", "60", "240"), seconds ("5S"),
 * and daily/weekly/monthly ("D", "W", "M"). Returns null for anything else
 * (unknown timeframe strings surface as NA, never a throw).
 */
export function parseTimeframe(timeframe: string): TimeframeParts | null {
  const minutes = /^(\d+)$/.exec(timeframe);
  if (minutes) {
    const multiplier = Number(minutes[1]);
    return { multiplier, unit: 'm', seconds: multiplier * UNIT_SECONDS.m };
  }
  const secondsMatch = /^(\d+)S$/.exec(timeframe);
  if (secondsMatch) {
    const multiplier = Number(secondsMatch[1]);
    return { multiplier, unit: 'S', seconds: multiplier * UNIT_SECONDS.S };
  }
  if (timeframe === 'D' || timeframe === 'W' || timeframe === 'M') {
    return { multiplier: 1, unit: timeframe, seconds: UNIT_SECONDS[timeframe] };
  }
  return null;
}

export function registerTimeframeBuiltins(engine: ExecutionEngine): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eng = engine as any;

  const currentTimeframe = (): string | null => {
    const tf = eng.timeframe;
    return typeof tf === 'string' ? tf : null;
  };

  // timeframe.period — the raw chart timeframe string ("1", "5", "60", "D", "W", "M").
  eng.builtins.set('timeframe.period', (): PineValue => {
    const tf = currentTimeframe();
    return tf !== null ? tf : NA;
  });

  // timeframe.timeframe — Pine v6 identifier: intraday keeps the raw string
  // ("5", "60"), daily/weekly/monthly gain the unit suffix ("1D", "1W", "1M").
  eng.builtins.set('timeframe.timeframe', (): PineValue => {
    const tf = currentTimeframe();
    if (tf === null) return NA;
    const parts = parseTimeframe(tf);
    if (parts === null) return NA;
    if (parts.unit === 'D' || parts.unit === 'W' || parts.unit === 'M') {
      return `${parts.multiplier}${parts.unit}`;
    }
    return tf;
  });

  // timeframe.in_seconds — seconds per bar (60 for "1", 300 for "5", 86400 for "D").
  eng.builtins.set('timeframe.in_seconds', (): PineValue => {
    const tf = currentTimeframe();
    if (tf === null) return NA;
    const parts = parseTimeframe(tf);
    return parts !== null ? parts.seconds : NA;
  });

  // timeframe.multiplier — numeric part of the period (1 for daily/weekly/monthly).
  eng.builtins.set('timeframe.multiplier', (): PineValue => {
    const tf = currentTimeframe();
    if (tf === null) return NA;
    const parts = parseTimeframe(tf);
    return parts !== null ? parts.multiplier : NA;
  });

  // is* class predicates — describe the timeframe's unit class.
  eng.builtins.set('timeframe.isseconds', (): PineValue => {
    const tf = currentTimeframe();
    if (tf === null) return NA;
    const parts = parseTimeframe(tf);
    return parts !== null ? parts.unit === 'S' : NA;
  });

  eng.builtins.set('timeframe.isminutes', (): PineValue => {
    const tf = currentTimeframe();
    if (tf === null) return NA;
    const parts = parseTimeframe(tf);
    return parts !== null ? parts.unit === 'm' : NA;
  });

  eng.builtins.set('timeframe.isintraday', (): PineValue => {
    const tf = currentTimeframe();
    if (tf === null) return NA;
    const parts = parseTimeframe(tf);
    return parts !== null ? parts.unit === 'S' || parts.unit === 'm' : NA;
  });

  eng.builtins.set('timeframe.isdaily', (): PineValue => {
    const tf = currentTimeframe();
    if (tf === null) return NA;
    const parts = parseTimeframe(tf);
    return parts !== null ? parts.unit === 'D' : NA;
  });

  eng.builtins.set('timeframe.isweekly', (): PineValue => {
    const tf = currentTimeframe();
    if (tf === null) return NA;
    const parts = parseTimeframe(tf);
    return parts !== null ? parts.unit === 'W' : NA;
  });

  eng.builtins.set('timeframe.ismonthly', (): PineValue => {
    const tf = currentTimeframe();
    if (tf === null) return NA;
    const parts = parseTimeframe(tf);
    return parts !== null ? parts.unit === 'M' : NA;
  });
}

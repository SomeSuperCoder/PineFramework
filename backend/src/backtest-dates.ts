/**
 * backtest-dates.ts
 *
 * THE SHARED UTC-midnight, day-aligned date-range resolver (design D6 / wave
 * M4): ONE pure function, THREE consumers — the HTTP API (routes/backtest.ts),
 * the CLI fetch path (multi-symbol-runner.ts), and the CLI display path
 * (backtest-cli.ts). This module KILLS the 720-vs-721 bar drift: the CLI used
 * to fetch a raw-ms now-anchored window while reporting a UTC-midnight window,
 * so the same days-back produced different bar sets per producer.
 *
 * Semantics (contract):
 *   - daysBack > 0  → { end = UTC midnight of `now`, start = end - N days }.
 *   - startDate / endDate (YYYY-MM-DD) → parsed at UTC midnight (per the ES
 *     spec, `new Date('YYYY-MM-DD')` IS UTC midnight).
 *   - Absent bound → undefined (start = earliest available bar, end = latest).
 *   - daysBack takes precedence over explicit dates (route parity behavior).
 *     Callers that need explicit dates to win (the CLI, whose per-bound
 *     precedence is "explicit bound > lookback") simply omit daysBack — the
 *     CLI mapper resolveCliDateRange (multi-symbol-runner.ts) does exactly
 *     that by pre-computing lookback labels and passing explicit bounds only.
 *
 * Injectable `now` (default Date.now()) keeps resolution deterministic — the
 * parity suite (scenario A) pins the clock to a non-midnight instant to prove
 * both producers land on the same day boundaries.
 *
 * Validation (error-patterns: validation at a domain boundary returns a
 * Result): the caller MUST handle ok:false — the API maps it to HTTP 400
 * VALIDATION_ERROR with field-level details, the CLI surfaces it as a fatal
 * error and exits non-zero.
 */

import type { ContractValidationError } from './backtest-contract.js';

const DAY_MS = 86_400_000;
/** Contract format: YYYY-MM-DD ONLY. A full ISO timestamp (e.g.
 *  '2026-06-15T12:00:00.000Z') would parse to MID-DAY and silently break
 *  UTC-midnight alignment, so anything outside this shape is rejected. */
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ResolvedDateRange {
  /** Resolved start timestamp (ms, UTC-midnight aligned). Absent = full history. */
  startDate?: number;
  /** Resolved end timestamp (ms, UTC-midnight aligned). Absent = latest bar. */
  endDate?: number;
}

export interface ResolveDateRangeInput {
  /** Inclusive start date (YYYY-MM-DD). */
  startDate?: string;
  /** Inclusive end date (YYYY-MM-DD). */
  endDate?: string;
  /** Lookback in days — takes precedence over startDate/endDate when > 0. */
  daysBack?: number;
  /** Injectable clock (ms epoch) for deterministic resolution. Defaults to Date.now(). */
  now?: number;
}

/** Discriminated validation envelope — same shape convention as the config
 *  normalizer's NormalizationResult (contract §3): ok:false → the run MUST
 *  NOT start. */
export type DateRangeResolution =
  | { ok: true; value: ResolvedDateRange }
  | { ok: false; errors: ContractValidationError[] };

export function resolveDateRange(input: ResolveDateRangeInput): DateRangeResolution {
  const now = input.now ?? Date.now();
  const errors: ContractValidationError[] = [];

  // ── now sanity (injectable test seam): a NaN/non-finite clock must fail
  //    loudly, not silently produce NaN timestamps downstream.
  if (typeof now !== 'number' || !Number.isFinite(now)) {
    errors.push({
      code: 'INVALID_FIELD_VALUE',
      message: 'now must be a finite epoch-milliseconds number',
      field: 'now',
    });
  }

  // ── daysBack: positive INTEGER only. A fractional lookback would push the
  //    start off a midnight boundary (breaking day alignment); NaN from a
  //    wire cast must fail loudly too.
  if (
    input.daysBack !== undefined &&
    (typeof input.daysBack !== 'number' || !Number.isInteger(input.daysBack) || input.daysBack <= 0)
  ) {
    errors.push({
      code: 'INVALID_FIELD_VALUE',
      message: 'daysBack must be a positive integer number of days',
      field: 'daysBack',
    });
  }

  // ── Explicit dates: parse at UTC midnight with a round-trip guard. The
  //    regex rejects non-YYYY-MM-DD shapes; the round-trip rejects calendar
  //    overflows (e.g. '2026-02-30') that an engine may normalize to a valid
  //    date instead of NaN.
  const parseDate = (value: string, field: 'startDate' | 'endDate'): number | undefined => {
    if (!DATE_ONLY_RE.test(value)) {
      errors.push({ code: 'INVALID_FIELD_VALUE', message: `${field} must be a YYYY-MM-DD date`, field });
      return undefined;
    }
    const ms = new Date(value).getTime();
    if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
      errors.push({ code: 'INVALID_FIELD_VALUE', message: `${field} is not a valid calendar date`, field });
      return undefined;
    }
    return ms;
  };

  const startMs = input.startDate !== undefined ? parseDate(input.startDate, 'startDate') : undefined;
  const endMs = input.endDate !== undefined ? parseDate(input.endDate, 'endDate') : undefined;

  // ── Range sanity: an inverted window is a caller error, not a silent
  //    empty-fetch. (Skip when either bound is absent — open bounds are valid.)
  if (startMs !== undefined && endMs !== undefined && endMs < startMs) {
    errors.push({
      code: 'INVALID_FIELD_VALUE',
      message: 'endDate must not be earlier than startDate',
      field: 'endDate',
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  // ── daysBack path (wins over explicit dates — route parity behavior). The
  //    end is the UTC midnight OF `now`: the "today" edge — a mid-day now
  //    still counts the full current day (Math.floor to the day boundary),
  //    which is exactly what the frontend's client-side resolution produces.
  if (input.daysBack !== undefined && input.daysBack > 0) {
    const end = Math.floor(now / DAY_MS) * DAY_MS;
    return { ok: true, value: { startDate: end - input.daysBack * DAY_MS, endDate: end } };
  }

  const range: ResolvedDateRange = {};
  if (startMs !== undefined) range.startDate = startMs;
  if (endMs !== undefined) range.endDate = endMs;
  return { ok: true, value: range };
}

/** UTC YYYY-MM-DD label for a resolved ms timestamp. SSOT for every consumer
 *  that renders the range (the API route's effective start/end and the CLI
 *  summary) — never duplicate `.toISOString().split('T')[0]` again. */
export function toUtcDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Single source of truth for the curated market options shared by the App
 * toolbar and the Backtest panel: tradable pairs and chart timeframes.
 *
 * Pair values are derived from the canonical `TRADABLE_PAIRS` registry so no
 * literal symbol list drifts from the token system. Timeframe options mirror
 * the chart toolbar's intervals (value + human label).
 */
import { TRADABLE_PAIRS } from 'pine-framework';

export interface Option {
  value: string;
  label: string;
}

/** All tradable pairs; value === symbol, labels read identically. */
export const PAIR_OPTIONS: Option[] = TRADABLE_PAIRS.map((pair) => ({
  value: pair,
  label: pair,
}));

/** Chart/backtest timeframe intervals (1m → 1W). */
export const TIMEFRAME_OPTIONS: Option[] = [
  { value: '1', label: '1m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '30', label: '30m' },
  { value: '60', label: '1h' },
  { value: '240', label: '4h' },
  { value: 'D', label: '1D' },
  { value: 'W', label: '1W' },
];

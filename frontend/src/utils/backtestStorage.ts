import type { CommissionMethodId, DateRangeMode } from '../types';
import { sliderBounds } from './candleLimit';

/** Single persistence key for every BacktestPanel setting. */
export const BACKTEST_SETTINGS_KEY = 'pine-backtest-settings';

/**
 * Persisted panel settings. This is the old `pine-backtest-settings` shape
 * extended with `timeframe`/`symbol` (the panel now owns them) — everything
 * else is byte-compatible with legacy payloads. The selected strategy is NOT
 * persisted: it stays session-scoped like the legacy panel.
 */
export interface BacktestSettings {
  initialCapital: number;
  timeframe: string;
  symbol: string;
  dateRangeMode: DateRangeMode;
  daysBack: number;
  startDate: string;
  endDate: string;
  commissionMethod: CommissionMethodId;
  commissionMethodSettings: Record<string, unknown> | null;
}

export const DEFAULT_BACKTEST_SETTINGS: BacktestSettings = {
  initialCapital: 10000,
  // '60' is the canonical 1-hour value used by INTERVALS, BacktestGeneralSettings
  // and the Bybit API (timeframeToMinutes has no '1h' format). The design intent
  // is "1 hour" — expressed in the codebase's canonical timeframe format.
  timeframe: '60',
  symbol: 'BTCUSDT',
  dateRangeMode: 'days_back',
  daysBack: 30,
  startDate: '',
  endDate: '',
  commissionMethod: 'jupiter_manual',
  // solPriceUsd mirrors the backend SSOT DEFAULT_SOL_USD_PRICE (73 — ≈ $72.6
  // rounded for stability) in src/strategy/commission-methods/config.ts. The
  // frontend cannot import the backend module, so this linkage is documented
  // and kept in lockstep manually. Do NOT hardcode a different price here.
  commissionMethodSettings: { dexFeeBps: 25, solPriceUsd: 73 },
};

/**
 * Load persisted backtest settings, migrating legacy payloads to the current
 * shape: missing keys (e.g. `timeframe`/`symbol` from pre-rework storage) fall
 * back to defaults, garbage values are dropped, and `daysBack` is clamped to
 * the slider bounds of the effective timeframe so a stored range can never
 * request more than SAFE_AMOUNT_OF_CANDLES.
 */
export function loadBacktestSettings(): BacktestSettings {
  try {
    const raw = localStorage.getItem(BACKTEST_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_BACKTEST_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<BacktestSettings>;
    const merged: BacktestSettings = { ...DEFAULT_BACKTEST_SETTINGS, ...sanitize(parsed) };

    const { max } = sliderBounds(merged.timeframe);
    merged.daysBack = Math.min(Math.max(merged.daysBack, 1), max);

    return merged;
  } catch {
    return { ...DEFAULT_BACKTEST_SETTINGS };
  }
}

export function saveBacktestSettings(settings: BacktestSettings): void {
  try {
    localStorage.setItem(BACKTEST_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage may be unavailable
  }
}

/** Keep only well-formed fields so typed state can never be corrupted by stored junk. */
function sanitize(raw: Partial<BacktestSettings>): Partial<BacktestSettings> {
  const out: Partial<BacktestSettings> = {};

  const positiveNumber = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
  // daysBack must be integral: fractional days are meaningless for a candle-count slider.
  const positiveInteger = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined;
  const string = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

  const capital = positiveNumber(raw.initialCapital);
  if (capital !== undefined) out.initialCapital = capital;
  const timeframe = string(raw.timeframe);
  if (timeframe !== undefined) out.timeframe = timeframe;
  const symbol = string(raw.symbol);
  if (symbol !== undefined) out.symbol = symbol;
  const daysBack = positiveInteger(raw.daysBack);
  if (daysBack !== undefined) out.daysBack = daysBack;
  const startDate = string(raw.startDate);
  if (startDate !== undefined) out.startDate = startDate;
  const endDate = string(raw.endDate);
  if (endDate !== undefined) out.endDate = endDate;

  if (raw.dateRangeMode === 'days_back' || raw.dateRangeMode === 'traditional') {
    out.dateRangeMode = raw.dateRangeMode;
  }
  if (raw.commissionMethod === 'jupiter_ultra' || raw.commissionMethod === 'jupiter_manual') {
    out.commissionMethod = raw.commissionMethod;
  }
  if (
    raw.commissionMethodSettings === null ||
    (typeof raw.commissionMethodSettings === 'object' && !Array.isArray(raw.commissionMethodSettings))
  ) {
    out.commissionMethodSettings = raw.commissionMethodSettings ?? null;
  }

  return out;
}

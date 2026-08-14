/**
 * telegram-backtest-producer.test.ts — Unit tests for the Telegram /backtest
 * producer seam (OpenSpec telegram-backtest-flow, contract M2):
 * `runTelegramBacktest` — the neutral composition of the SAME core producers
 * as CLI/HTTP (resolveDateRange → normalizeExplicitOverride →
 * buildBacktestConfigOverride → applyDexFee → runBacktestPipeline → toOutcome
 * → buildDecisionWarnings → toApiResult).
 *
 * Network is fully mocked at the boundary: fetchBars (Bybit), fetchDexFeeBps
 * (Jupiter) and fetchSolPriceUsd are stubbed — no live API is ever hit. The
 * engine pipeline itself runs FOR REAL on deterministic bars (the same
 * fixture strategy as backtest-parity.test.ts), so the success path proves
 * the seam composes a real BacktestApiResult, not a mock echo.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Bar } from 'pine-framework';
import {
  runTelegramBacktest,
  type TelegramBacktestDeps,
  type TelegramBacktestParams,
} from '../src/telegram/backtest/runTelegramBacktest.js';
import { fetchBars } from '../src/bybit/fetch-bars.js';
import { fetchSolPriceUsd } from '../src/services/sol-price-fetcher.js';
import { fetchDexFeeBps } from 'pine-framework/strategy/jupiter-fee-fetcher';
import type { ScriptEntry, ScriptFileManager } from '../src/store/ScriptFileManager.js';

vi.mock('../src/bybit/fetch-bars.js', () => ({ fetchBars: vi.fn() }));
vi.mock('../src/services/sol-price-fetcher.js', () => ({
  fetchSolPriceUsd: vi.fn(async () => null),
}));
vi.mock('pine-framework/strategy/jupiter-fee-fetcher', () => ({
  fetchDexFeeBps: vi.fn(),
  getCachedDexFeeBps: vi.fn(() => undefined),
  clearFeeCache: vi.fn(),
  getCacheFilePath: vi.fn(() => ''),
}));

// ── Deterministic fixture: EMA-cross strategy + crossover bars (same recipe
//    as backtest-parity.test.ts, so the seam's real pipeline is proven). ────
const STRATEGY_SOURCE = `//@version=5
strategy("Simple EMA Cross Strategy", overlay=true, initial_capital=10000)
fastLength = input.int(9, title="Fast EMA Length")
slowLength = input.int(21, title="Slow EMA Length")
fastEMA = ta.ema(close, fastLength)
slowEMA = ta.ema(close, slowLength)
longCondition = ta.crossover(fastEMA, slowEMA)
shortCondition = ta.crossunder(fastEMA, slowEMA)
if longCondition
    strategy.entry("Long", strategy.long)
if shortCondition
    strategy.entry("Short", strategy.short)
`;

function createCrossoverBars(): Bar[] {
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < 120; i++) {
    const open = price;
    let close: number;
    if (i < 30) close = open + 2.0;
    else if (i < 60) close = open - 2.0;
    else if (i < 90) close = open + 2.0;
    else close = open - 2.0;
    bars.push({
      timestamp: 1700000000000 + i * 3600000,
      open,
      high: Math.max(open, close) + 0.5,
      low: Math.min(open, close) - 0.5,
      close,
      volume: 1000,
    });
    price = close;
  }
  return bars;
}

function createManyBars(count: number): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < count; i++) {
    bars.push({
      timestamp: 1700000000000 + i * 3600000,
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 1000,
    });
  }
  return bars;
}

function strategyEntry(overrides: Partial<ScriptEntry> = {}): ScriptEntry {
  return {
    id: 'strat-1',
    name: 'EMA Cross',
    source: STRATEGY_SOURCE,
    scriptType: 'strategy',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

/** Fake ScriptFileManager — only the seam's two calls are needed. */
function makeScripts(entries: ScriptEntry[]): ScriptFileManager {
  return {
    getById: vi.fn(async (id: string) => entries.find((e) => e.id === id)),
    getAll: vi.fn(async () => entries),
  } as unknown as ScriptFileManager;
}

const BASE_PARAMS: TelegramBacktestParams = {
  strategyId: 'strat-1',
  symbol: 'BTCUSDT',
  timeframe: '60',
  daysBack: 30,
  commissionMethod: 'jupiter_manual',
};

/** Mid-day clock — proves the shared UTC-midnight resolver anchors the range. */
const NOW = Date.UTC(2026, 6, 15, 12, 0);

function deps(scripts: ScriptFileManager): TelegramBacktestDeps {
  return { scripts, now: NOW };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchSolPriceUsd).mockResolvedValue(null);
});

describe('runTelegramBacktest — strategy resolution', () => {
  it('empty library → NO_STRATEGIES (no fetch attempted)', async () => {
    const scripts = makeScripts([]);
    const res = await runTelegramBacktest(BASE_PARAMS, deps(scripts));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NO_STRATEGIES');
    expect(fetchBars).not.toHaveBeenCalled();
  });

  it('missing strategy id → STRATEGY_NOT_FOUND', async () => {
    const scripts = makeScripts([strategyEntry()]);
    const res = await runTelegramBacktest({ ...BASE_PARAMS, strategyId: 'missing' }, deps(scripts));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('STRATEGY_NOT_FOUND');
    expect(fetchBars).not.toHaveBeenCalled();
  });

  it('indicator script → NOT_A_STRATEGY', async () => {
    const scripts = makeScripts([strategyEntry({ scriptType: 'indicator' })]);
    const res = await runTelegramBacktest(BASE_PARAMS, deps(scripts));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('NOT_A_STRATEGY');
    expect(fetchBars).not.toHaveBeenCalled();
  });
});

describe('runTelegramBacktest — settings + bars', () => {
  it('invalid commission method → INVALID_SETTINGS (before any fetch)', async () => {
    const scripts = makeScripts([strategyEntry()]);
    const res = await runTelegramBacktest(
      { ...BASE_PARAMS, commissionMethod: 'bogus' as TelegramBacktestParams['commissionMethod'] },
      deps(scripts),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('INVALID_SETTINGS');
    expect(fetchBars).not.toHaveBeenCalled();
  });

  it('empty bars → DATA_FETCH_FAILED', async () => {
    const scripts = makeScripts([strategyEntry()]);
    vi.mocked(fetchBars).mockResolvedValue([]);
    const res = await runTelegramBacktest(BASE_PARAMS, deps(scripts));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('DATA_FETCH_FAILED');
  });

  it('over-1500 bars → TOO_MANY_BARS, pre-validated BEFORE the live fee fetch', async () => {
    const scripts = makeScripts([strategyEntry()]);
    vi.mocked(fetchBars).mockResolvedValue(createManyBars(1501));
    const res = await runTelegramBacktest(BASE_PARAMS, deps(scripts));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('TOO_MANY_BARS');
    // The cap check runs before applyDexFee — the fee fetcher must never fire.
    expect(fetchDexFeeBps).not.toHaveBeenCalled();
  });

  it('forwards the resolved UTC-midnight range to fetchBars', async () => {
    const scripts = makeScripts([strategyEntry()]);
    vi.mocked(fetchBars).mockResolvedValue(createCrossoverBars());
    vi.mocked(fetchDexFeeBps).mockResolvedValue({ dexFeeBps: 10, source: 'api' });
    const res = await runTelegramBacktest(BASE_PARAMS, deps(scripts));
    expect(res.ok).toBe(true);
    const end = Math.floor(NOW / 86_400_000) * 86_400_000;
    expect(fetchBars).toHaveBeenCalledWith(
      'BTCUSDT',
      '60',
      end - 30 * 86_400_000,
      end,
      undefined,
      undefined,
    );
  });
});

describe('runTelegramBacktest — live fee policy (Wise Old Man ruling B)', () => {
  it('fee fetch failure → FEE_FETCH_FAILED with sanitized message', async () => {
    const scripts = makeScripts([strategyEntry()]);
    vi.mocked(fetchBars).mockResolvedValue(createCrossoverBars());
    // ETHUSDT is intentionally never fetched in another test: applyDexFee keeps
    // a module-level 10-minute TTL cache keyed by symbol, so a previously
    // fetched symbol would be served from cache and never reach the fetcher.
    vi.mocked(fetchDexFeeBps).mockRejectedValue(
      new Error('Jupiter API at https://internal.corp/quote failed'),
    );
    const res = await runTelegramBacktest(
      { ...BASE_PARAMS, symbol: 'ETHUSDT' },
      deps(scripts),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('FEE_FETCH_FAILED');
      expect(res.error.message).toContain('[redacted-url]');
      expect(res.error.message).not.toContain('internal.corp');
    }
  });

  it('explicit dexFeeBps bypasses the live fee fetch entirely', async () => {
    const scripts = makeScripts([strategyEntry()]);
    vi.mocked(fetchBars).mockResolvedValue(createCrossoverBars());
    const res = await runTelegramBacktest(
      { ...BASE_PARAMS, commissionMethodSettings: { dexFeeBps: 42 } },
      deps(scripts),
    );
    expect(res.ok).toBe(true);
    expect(fetchDexFeeBps).not.toHaveBeenCalled();
  });
});

describe('runTelegramBacktest — success path', () => {
  it('returns the canonical BacktestApiResult shape with real metrics', async () => {
    const scripts = makeScripts([strategyEntry()]);
    vi.mocked(fetchBars).mockResolvedValue(createCrossoverBars());
    vi.mocked(fetchDexFeeBps).mockResolvedValue({ dexFeeBps: 10, source: 'api' });
    const res = await runTelegramBacktest(BASE_PARAMS, deps(scripts));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.metrics.totalTrades).toBeGreaterThan(0);
    expect(typeof res.result.buyHoldReturn).toBe('number');
    expect(typeof res.result.effectiveConfig.initialCapital).toBe('number');
    expect(Array.isArray(res.result.warnings)).toBe(true);
    expect(res.result.barCount).toBe(120);
  });

  it('accepts jupiter_ultra and fetches its live fee', async () => {
    const scripts = makeScripts([strategyEntry()]);
    vi.mocked(fetchBars).mockResolvedValue(createCrossoverBars());
    vi.mocked(fetchDexFeeBps).mockResolvedValue({ dexFeeBps: 10, source: 'api' });
    const res = await runTelegramBacktest(
      {
        ...BASE_PARAMS,
        symbol: 'SOLUSDT', // never fetched elsewhere → no applyDexFee cache hit
        commissionMethod: 'jupiter_ultra',
        commissionMethodSettings: { pairCategory: 'sol_stable' },
      },
      deps(scripts),
    );
    expect(res.ok).toBe(true);
    expect(fetchDexFeeBps).toHaveBeenCalledWith('SOLUSDT');
  });
});

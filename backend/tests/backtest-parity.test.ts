/**
 * backtest-parity.test.ts
 *
 * OpenSpec task 5.1 — parity test for the consolidated backtest glue.
 *
 * Locks the NEW shared mappers (backtest-result.ts / backtest-config.ts) against:
 *   1. API output shape  → fixtures/backtest-api-result.golden.json
 *   2. CLI output shape   → fixtures/backtest-cli-metrics.golden.json
 *   3. Auto-select subset → taken verbatim from outcome.metrics
 *   4. Config glue unit behavior (buildBacktestConfigOverride / applyDexFee /
 *      assertRealisticCommissionMethod)
 *
 * The bars + strategy below are copied VERBATIM from
 * backtest-golden-capture.test.ts so the engine produces the identical metrics
 * that the fixtures were captured from.
 */

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Bar, StrategyConfig } from 'pine-framework';

import { runBacktestPipeline } from '../src/backtest-runner.js';
import {
  toOutcome,
  toApiResult,
  toCliSymbolResult,
  toAutoSelectMetrics,
} from '../src/backtest-result.js';
import {
  buildBacktestConfigOverride,
  applyDexFee,
  assertRealisticCommissionMethod,
  type BacktestConfigInput,
} from '../src/backtest-config.js';

// ── Mock the live DEX-fee fetcher (only used by jupiter methods) ──────────────
vi.mock('pine-framework/strategy/jupiter-fee-fetcher', () => ({
  fetchDexFeeBps: vi.fn(),
}));
import { fetchDexFeeBps } from 'pine-framework/strategy/jupiter-fee-fetcher';

// ── Mock the live SOL-price fetcher (parity with the frontend /dex-fee panel) ─
vi.mock('../src/services/sol-price-fetcher.js', () => ({
  fetchSolPriceUsd: vi.fn().mockResolvedValue(150),
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const API_FIXTURE = path.join(FIXTURE_DIR, 'backtest-api-result.golden.json');
const CLI_FIXTURE = path.join(FIXTURE_DIR, 'backtest-cli-metrics.golden.json');

function loadFixture(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// ── Fixed strategy + bars (verbatim from backtest-golden-capture.test.ts) ─────
const STRATEGY = `//@version=5
strategy("Simple EMA Cross Strategy", overlay=true, initial_capital=10000)

// --- Inputs ---
fastLength = input.int(9, title="Fast EMA Length")
slowLength = input.int(21, title="Slow EMA Length")

// --- Calculate Indicators ---
fastEMA = ta.ema(close, fastLength)
slowEMA = ta.ema(close, slowLength)

// --- Strategy Logic ---
longCondition = ta.crossover(fastEMA, slowEMA)
shortCondition = ta.crossunder(fastEMA, slowEMA)

// --- Execute Trades ---
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
    const high = Math.max(open, close) + 0.5;
    const low = Math.min(open, close) - 0.5;
    bars.push({
      timestamp: 1700000000000 + i * 3600000,
      open,
      high,
      low,
      close,
      volume: 1000,
    });
    price = close;
  }
  return bars;
}

/** Build a deterministic BacktestOutcome via the shared toOutcome glue. */
function buildOutcome() {
  const bars = createCrossoverBars();
  const pipeline = runBacktestPipeline({ script: STRATEGY, bars });
  if (!pipeline.success || !pipeline.engine) {
    throw new Error('runBacktestPipeline failed to produce an engine');
  }
  const outcome = toOutcome(bars, pipeline.engine);
  if (!outcome) throw new Error('toOutcome returned null');
  return outcome;
}

describe('backtest glue parity (task 5.1)', () => {
  describe('API parity', () => {
    it('toApiResult deep-equals the captured API golden fixture', () => {
      const outcome = buildOutcome();
      const actual = toApiResult(outcome);
      const expected = loadFixture(API_FIXTURE);
      expect(actual).toEqual(expected);
    });
  });

  describe('CLI parity', () => {
    it('toCliSymbolResult deep-equals the captured CLI golden fixture', () => {
      const outcome = buildOutcome();
      const actual = toCliSymbolResult(outcome);
      const expected = loadFixture(CLI_FIXTURE);
      expect(actual).toEqual(expected);
    });
  });

  describe('Auto-select parity', () => {
    it('toAutoSelectMetrics copies the 8-field subset verbatim from outcome.metrics', () => {
      const outcome = buildOutcome();
      const expected = {
        sharpeRatio: outcome.metrics.sharpeRatio,
        profitFactor: outcome.metrics.profitFactor,
        totalPnl: outcome.metrics.totalPnl,
        totalPnlPercent: outcome.metrics.totalPnlPercent,
        winRate: outcome.metrics.winRate,
        totalTrades: outcome.metrics.totalTrades,
        maxDrawdown: outcome.metrics.maxDrawdown,
        maxDrawdownPercent: outcome.metrics.maxDrawdownPercent,
      };
      expect(toAutoSelectMetrics(outcome)).toEqual(expected);
    });
  });
});

describe('backtest-config glue unit tests (task 5.1)', () => {
  describe('buildBacktestConfigOverride', () => {
    it('emits only present keys — never undefined, never canonical CLI-absent keys', () => {
      const input: BacktestConfigInput = {
        initialCapital: 10000,
        commission: 0.1,
        commissionMethod: 'jupiter_ultra',
        // commissionType, slippageType, marginLong, marginShort etc. intentionally undefined
      };
      const override = buildBacktestConfigOverride(input);

      expect(Object.keys(override).sort()).toEqual(
        ['commission', 'commissionMethod', 'initialCapital'].sort(),
      );
      // No undefined values leaked in.
      for (const v of Object.values(override)) expect(v).toBeDefined();
      // Canonical keys the CLI never sends must stay absent.
      expect(override).not.toHaveProperty('slippageType');
      expect(override).not.toHaveProperty('marginLong');
      expect(override).not.toHaveProperty('marginShort');
      expect(override).not.toHaveProperty('defaultQtyType');
    });
  });

  describe('applyDexFee', () => {
    it('non-Jupiter method returns the override with injected solPriceUsd and never fetches a fee', async () => {
      const override = { commissionMethod: 'fixed' } as unknown as Partial<StrategyConfig>;
      const res = await applyDexFee('BTCUSDT', override);
      expect(res.commissionMethod).toBe('fixed');
      const cms = res.commissionMethodSettings as unknown as Record<string, unknown>;
      expect(cms.solPriceUsd).toBe(150);
      expect(vi.mocked(fetchDexFeeBps)).not.toHaveBeenCalled();
    });

    it('jupiter method with successful fetch sets dexFeeBps + solPriceUsd on commissionMethodSettings', async () => {
      vi.mocked(fetchDexFeeBps).mockResolvedValue({ dexFeeBps: 42 });
      const override = { commissionMethod: 'jupiter_ultra' } as Partial<StrategyConfig>;
      const res = await applyDexFee('BTCUSDT', override);
      const cms = res.commissionMethodSettings as unknown as Record<string, unknown>;
      expect(cms.dexFeeBps).toBe(42);
      expect(cms.solPriceUsd).toBe(150);
    });

    it('jupiter method with fetch failure + onFailure:"fallback" returns flat commission + solPriceUsd', async () => {
      vi.mocked(fetchDexFeeBps).mockRejectedValue(new Error('network down'));
      const override = { commissionMethod: 'jupiter_manual' } as Partial<StrategyConfig>;
      const res = await applyDexFee('BTCUSDT', override, { onFailure: 'fallback' });
      expect(res.commission).toBe(0.1);
      expect(res.commissionType).toBe('percent');
      const cms = res.commissionMethodSettings as unknown as Record<string, unknown>;
      expect(cms.solPriceUsd).toBe(150);
    });

    it('jupiter method with fetch failure + default onFailure:"throw" rejects', async () => {
      vi.mocked(fetchDexFeeBps).mockRejectedValue(new Error('network down'));
      const override = { commissionMethod: 'jupiter_ultra' } as Partial<StrategyConfig>;
      await expect(applyDexFee('BTCUSDT', override)).rejects.toThrow();
    });
  });

  describe('assertRealisticCommissionMethod', () => {
    it('allowNonJupiter=true never throws (any method)', () => {
      expect(() => assertRealisticCommissionMethod('fixed', true)).not.toThrow();
      expect(() => assertRealisticCommissionMethod(undefined, true)).not.toThrow();
    });

    it('allowNonJupiter=false + jupiter method does not throw', () => {
      expect(() => assertRealisticCommissionMethod('jupiter_ultra', false)).not.toThrow();
      expect(() => assertRealisticCommissionMethod('jupiter_manual', false)).not.toThrow();
    });

    it('allowNonJupiter=false + non-jupiter method throws with the expected flag', () => {
      expect(() => assertRealisticCommissionMethod('fixed', false)).toThrow(
        /--allow-unrealistic-results/,
      );
    });
  });
});

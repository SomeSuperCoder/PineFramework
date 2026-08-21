import { vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateResults } from '../src/cli/result-aggregator.js';
import type { SymbolResult } from '../src/cli/types.js';
import { runSymbolBacktest } from '../src/cli/symbol-runner.js';
import {
  buildBacktestExport,
  scriptHash,
  VERSION,
  type BacktestExport,
  type Bar,
  type StrategyConfig,
} from 'pine-framework';

// ── A2 CLI flag tests (below) are offline by design: never touch the live
//    Bybit API / SOL price oracle. Same mock convention as
//    backend/tests/backtest-export.test.ts. ─────────────────────────────────
vi.mock('../src/bybit/fetch-bars.js', () => ({ fetchBars: vi.fn() }));
vi.mock('../src/services/sol-price-fetcher.js', () => ({
  fetchSolPriceUsd: vi.fn().mockResolvedValue(150),
}));
import { fetchBars } from '../src/bybit/fetch-bars.js';

function makeCompletedResult(symbol: string, overrides: Partial<{ netProfitPercent: number; profitFactor: number; maxDrawdownPercent: number; winRate: number; sharpeRatio: number; totalTrades: number; buyHoldReturn: number }> = {}): SymbolResult {
  return {
    symbol,
    status: 'completed',
    metrics: {
      netProfit: overrides.netProfitPercent ?? 100,
      netProfitPercent: overrides.netProfitPercent ?? 10,
      profitFactor: overrides.profitFactor ?? 1.5,
      maxDrawdownPercent: overrides.maxDrawdownPercent ?? 5,
      winRate: overrides.winRate ?? 55,
      sharpeRatio: overrides.sharpeRatio ?? 1.2,
      totalTrades: overrides.totalTrades ?? 40,
      buyHoldReturn: overrides.buyHoldReturn ?? 5,
    },
  };
}

function makeFailedResult(symbol: string, error: string): SymbolResult {
  return { symbol, status: 'failed', error };
}

const DATE_RANGE = { start: '2026-04-14', end: '2026-07-13' };

/** Shorthand to get the first timeframe result from aggregateResults. */
function firstTf(output: ReturnType<typeof aggregateResults>) {
  return output.timeframes[0]!;
}

describe('result-aggregator', () => {
  describe('aggregateResults', () => {
    it('returns empty summary when all symbols fail', () => {
      const results = [makeFailedResult('BTCUSDT', 'compile error')];
      const output = aggregateResults('test.pine', '60', results, DATE_RANGE);
      const tf = firstTf(output);
      expect(tf.crossPairSummary.successfulSymbols).toBe(0);
      expect(tf.crossPairSummary.failedSymbols).toBe(1);
      expect(tf.crossPairSummary.overfittingRisk).toBe('HIGH');
    });

    it('computes correct averages for single symbol', () => {
      const results = [makeCompletedResult('BTCUSDT', { netProfitPercent: 10 })];
      const output = aggregateResults('test.pine', '60', results, DATE_RANGE);
      const tf = firstTf(output);
      expect(tf.crossPairSummary.avgNetProfitPercent).toBe(10);
      expect(tf.crossPairSummary.successfulSymbols).toBe(1);
      expect(tf.crossPairSummary.failedSymbols).toBe(0);
    });

    it('computes correct averages for multiple symbols', () => {
      const results = [
        makeCompletedResult('BTCUSDT', { netProfitPercent: 10 }),
        makeCompletedResult('ETHUSDT', { netProfitPercent: 20 }),
        makeCompletedResult('SOLUSDT', { netProfitPercent: 30 }),
      ];
      const output = aggregateResults('test.pine', '60', results, DATE_RANGE);
      const tf = firstTf(output);
      expect(tf.crossPairSummary.avgNetProfitPercent).toBe(20);
    });

    it('computes LOW overfitting risk when returns are consistent', () => {
      const results = [
        makeCompletedResult('BTCUSDT', { netProfitPercent: 10 }),
        makeCompletedResult('ETHUSDT', { netProfitPercent: 12 }),
        makeCompletedResult('SOLUSDT', { netProfitPercent: 11 }),
      ];
      const output = aggregateResults('test.pine', '60', results, DATE_RANGE);
      const tf = firstTf(output);
      expect(tf.crossPairSummary.overfittingRisk).toBe('LOW');
      expect(tf.crossPairSummary.coefficientOfVariation).toBeLessThan(0.5);
    });

    it('computes HIGH overfitting risk when returns vary wildly', () => {
      const results = [
        makeCompletedResult('BTCUSDT', { netProfitPercent: 100 }),
        makeCompletedResult('ETHUSDT', { netProfitPercent: -50 }),
        makeCompletedResult('SOLUSDT', { netProfitPercent: 10 }),
      ];
      const output = aggregateResults('test.pine', '60', results, DATE_RANGE);
      const tf = firstTf(output);
      expect(tf.crossPairSummary.overfittingRisk).toBe('HIGH');
      expect(tf.crossPairSummary.coefficientOfVariation).toBeGreaterThan(1.5);
    });

    it('identifies best and worst pairs correctly', () => {
      const results = [
        makeCompletedResult('BTCUSDT', { netProfitPercent: 10 }),
        makeCompletedResult('ETHUSDT', { netProfitPercent: 30 }),
        makeCompletedResult('SOLUSDT', { netProfitPercent: 5 }),
      ];
      const output = aggregateResults('test.pine', '60', results, DATE_RANGE);
      const tf = firstTf(output);
      expect(tf.crossPairSummary.bestPair).toBe('ETHUSDT');
      expect(tf.crossPairSummary.worstPair).toBe('SOLUSDT');
    });

    it('skips failed symbols in aggregation', () => {
      const results = [
        makeCompletedResult('BTCUSDT', { netProfitPercent: 10 }),
        makeFailedResult('ETHUSDT', 'compile error'),
        makeCompletedResult('SOLUSDT', { netProfitPercent: 20 }),
      ];
      const output = aggregateResults('test.pine', '60', results, DATE_RANGE);
      const tf = firstTf(output);
      expect(tf.crossPairSummary.successfulSymbols).toBe(2);
      expect(tf.crossPairSummary.failedSymbols).toBe(1);
      expect(tf.crossPairSummary.avgNetProfitPercent).toBe(15);
    });

    it('includes all symbol results in output', () => {
      const results = [
        makeCompletedResult('BTCUSDT'),
        makeFailedResult('ETHUSDT', 'error'),
      ];
      const output = aggregateResults('test.pine', '60', results, DATE_RANGE);
      const tf = firstTf(output);
      expect(tf.symbols).toHaveLength(2);
      expect(tf.symbols[0]!.symbol).toBe('BTCUSDT');
      expect(tf.symbols[1]!.symbol).toBe('ETHUSDT');
    });

    it('sets script and timeframe in output', () => {
      const output = aggregateResults('my_strategy.pine', '240', [], DATE_RANGE);
      expect(output.script).toBe('my_strategy.pine');
      expect(firstTf(output).timeframe).toBe('240');
    });

    it('sets date range in output', () => {
      const output = aggregateResults('test.pine', '60', [], DATE_RANGE);
      expect(output.dateRange).toEqual(DATE_RANGE);
      expect(firstTf(output).dateRange).toEqual(DATE_RANGE);
    });

    it('computes median profit factor correctly', () => {
      const results = [
        makeCompletedResult('BTCUSDT', { profitFactor: 1.0 }),
        makeCompletedResult('ETHUSDT', { profitFactor: 3.0 }),
        makeCompletedResult('SOLUSDT', { profitFactor: 2.0 }),
      ];
      const output = aggregateResults('test.pine', '60', results, DATE_RANGE);
      const tf = firstTf(output);
      expect(tf.crossPairSummary.medianProfitFactor).toBe(2.0);
    });

    it('produces exactly one timeframe entry for single-timeframe call', () => {
      const output = aggregateResults('test.pine', '60', [], DATE_RANGE);
      expect(output.timeframes).toHaveLength(1);
    });
  });
});

// ===========================================================================
// A2 CLI --max-bars contract (engine-fix defect 2)
//
// NOTE on testable surface: parseArgs/validateOptions are module-private in
// backtest-cli.ts (a node script with NO exports; main() executes at import),
// so the flag's parse + guard logic cannot be unit-tested without a production
// change (exporting them) or spawning the CLI binary. Those are out of the
// test engineer's lane — the guard (`Number.isInteger && > 0`) is verified by
// code review. What IS testable — and locked here — is the PUBLIC wiring:
//   1. runSymbolBacktest extracts maxBars from the cliOptions record and the
//      pipeline enforces it (cap raised through the CLI wiring; default
//      preserved when the flag is absent).
//   2. buildBacktestExport's request layer carries `maxBars` ONLY when the
//      flag was passed (undefined keys are dropped — default runs emit NO new
//      key, golden snapshots unaffected; A2 export-compat watch item).
// ===========================================================================

// ── Strategy verbatim from backtest-export.test.ts (proven trade-generating) ─
const CLI_STRATEGY = `//@version=5
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

function makeBars(count: number): Bar[] {
  const bars: Bar[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = i % 60 < 30 ? open + 2.0 : open - 2.0;
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

/** Minimal export object (shape verbatim from backtest-export.test.ts). */
function makeExportObj(request: Record<string, unknown>): BacktestExport {
  return buildBacktestExport({
    runId: 'run-1',
    source: 'script',
    generatedAt: '2026-08-14T12:00:00.000Z',
    meta: {
      symbol: 'BTCUSDT',
      timeframe: '60',
      barCount: 3,
      engineVersion: VERSION,
      scriptHash: scriptHash(CLI_STRATEGY),
    },
    params: {
      request,
      configOverride: {},
      effectiveConfig: { initialCapital: 10000 } as unknown as StrategyConfig,
    },
    input: { bars: makeBars(3) },
    output: {
      series: new Map(),
      barTimestamps: [1700000000000, 1700003600000, 1700007200000],
      strategyMarkers: [],
      equityCurve: [],
      drawdownCurve: [],
      equityPoints: [],
      monthlyReturns: {},
      buyHoldReturn: 0,
    },
    trades: [],
    orders: [],
    metrics: {},
  });
}

describe('CLI --max-bars wiring (A2)', () => {
  it('forwards maxBars from cliOptions to the pipeline — 1600 bars pass with --max-bars 2000', async () => {
    vi.mocked(fetchBars).mockResolvedValue(makeBars(1600));
    const result = await runSymbolBacktest(
      CLI_STRATEGY,
      'BTCUSDT',
      '60',
      undefined,
      undefined,
      undefined,
      { symbols: 'BTCUSDT', maxBars: 2000 },
    );
    expect(result.status).toBe('completed');
  });

  it('preserves the DEFAULT 1500 cap when the flag is absent — 1600 bars fail', async () => {
    vi.mocked(fetchBars).mockResolvedValue(makeBars(1600));
    const result = await runSymbolBacktest(
      CLI_STRATEGY,
      'BTCUSDT',
      '60',
      undefined,
      undefined,
      undefined,
      { symbols: 'BTCUSDT' },
    );
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Maximum is 1500');
  });

  it('forwards the per-cell timeframe to the engine via the cliOptions record', async () => {
    vi.mocked(fetchBars).mockResolvedValue(makeBars(120));
    let seen: { timeframe?: unknown; period?: unknown } = {};
    const result = await runSymbolBacktest(
      CLI_STRATEGY,
      'BTCUSDT',
      'D',
      undefined,
      undefined,
      undefined,
      // Mirrors the real CLI shape: multi-symbol-runner spreads {...options,
      // timeframe: tf} into the per-cell record.
      { symbols: 'BTCUSDT', timeframe: 'D' },
      (ctx) => {
        seen = {
          timeframe: ctx.cliOptions.timeframe,
          period: ctx.engine.builtins.get('timeframe.period')?.(),
        };
      },
    );
    expect(result.status).toBe('completed');
    expect(seen.timeframe).toBe('D');
    expect(seen.period).toBe('D');
  });
});

describe('CLI --max-bars export request layer (A2 watch item)', () => {
  it('carries maxBars in params.request ONLY when the flag was passed', () => {
    const withFlag = makeExportObj({ symbols: 'BTCUSDT', maxBars: 50000 });
    expect(withFlag.params.request.maxBars).toBe(50000);

    const withoutFlag = makeExportObj({ symbols: 'BTCUSDT' });
    expect((withoutFlag.params.request as Record<string, unknown>).maxBars).toBeUndefined();
  });
});

// ===========================================================================
// Strict numeric flag parsing (float flags)
//
// Regression: --initial-capital / --slippage / --default-qty used parseFloat,
// which prefix-parses garbage like "12abc" into 12. They now use raw Number()
// + validateOptions guards (finite + range, mirroring normalize-explicit-
// config.ts). parseArgs/validateOptions are module-private, so these tests
// spawn the CLI binary via tsx — rejection happens before any network access
// (exit 2 from the validation gate), keeping the tests offline.
// ===========================================================================
describe('CLI strict float flag parsing', () => {
  const cliPath = resolve(fileURLToPath(new URL('../src/cli/backtest-cli.ts', import.meta.url)));

  function runCli(extraArgs: string[]): { status: number | null; stderr: string } {
    const dir = mkdtempSync(join(tmpdir(), 'cli-float-'));
    const script = join(dir, 'strategy.pine');
    writeFileSync(script, '// dummy\n');
    try {
      const res = spawnSync('pnpm', ['exec', 'tsx', cliPath, script, ...extraArgs], {
        encoding: 'utf8',
        timeout: 60_000,
      });
      return { status: res.status, stderr: res.stderr ?? '' };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it.each([
    ['--initial-capital', 'Must be a positive number'],
    ['--slippage', 'Must be a non-negative number'],
    ['--default-qty', 'Must be a positive number'],
  ])('rejects trailing-garbage %s 12abc with exit code 2', (flag, expectedMsg) => {
    const { status, stderr } = runCli([flag, '12abc']);
    expect(status).toBe(2);
    expect(stderr).toContain(`Invalid ${flag}`);
    expect(stderr).toContain(expectedMsg);
  });
});

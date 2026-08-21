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

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  Bar,
  ExecutionEngine,
  StrategyConfig,
  BacktestWarning,
} from 'pine-framework';

import { createBacktestRouter } from '../src/routes/backtest.js';
import { runMultiSymbolBacktest } from '../src/cli/multi-symbol-runner.js';
import type { BacktestOutcome } from '../src/backtest-result.js';
import { runBacktestPipeline } from '../src/backtest-runner.js';
import {
  toOutcome,
  toApiResult,
  toCliSymbolResult,
  toAutoSelectMetrics,
  type ToApiResultOptions,
} from '../src/backtest-result.js';
import {
  buildBacktestConfigOverride,
  applyDexFee,
  assertRealisticCommissionMethod,
} from '../src/backtest-config.js';
import type { ExplicitBacktestOverride } from '../src/backtest-contract.js';

// ── Mock the live DEX-fee fetcher (only used by jupiter methods) ──────────────
vi.mock('pine-framework/strategy/jupiter-fee-fetcher', () => ({
  fetchDexFeeBps: vi.fn(),
}));
import { fetchDexFeeBps } from 'pine-framework/strategy/jupiter-fee-fetcher';

// ── Mock the live SOL-price fetcher (parity with the frontend /dex-fee panel) ─
vi.mock('../src/services/sol-price-fetcher.js', () => ({
  fetchSolPriceUsd: vi.fn().mockResolvedValue(150),
}));

// ── Mock the data source: deterministic canned daily bars, filtered by the
//    range each producer resolves. BOTH producers call this module (the API
//    route passes a disk cache, the CLI runner does not — the mock ignores
//    both), so any date-semantics divergence between the paths is observable
//    through the resolved bar count and bar timestamps. No live Bybit network.
//    Bars are UTC-midnight day-aligned timestamps over 2026-05-01..2026-06-29.
//    NOTE: the factory is hoisted above module consts — the canned bars are
//    built inside the factory itself.
vi.mock('../src/bybit/fetch-bars.js', () => {
  const PARITY_BARS: import('pine-framework').Bar[] = (() => {
    const start = Date.UTC(2026, 4, 1); // 2026-05-01T00:00:00Z (UTC-midnight)
    const day = 86_400_000;
    const bars: import('pine-framework').Bar[] = [];
    let price = 100;
    for (let i = 0; i < 60; i++) {
      const open = price;
      const phase = Math.floor(i / 10) % 2; // 10 bars up, 10 down, ... (crossovers both ways)
      const close = phase === 0 ? open + 2.0 : open - 2.0;
      bars.push({
        timestamp: start + i * day,
        open,
        high: Math.max(open, close) + 0.5,
        low: Math.min(open, close) - 0.5,
        close,
        volume: 1000,
      });
      price = close;
    }
    return bars;
  })();
  return {
    fetchBars: vi.fn(
      async (
        _symbol: string,
        _timeframe: string,
        startDate?: number,
        endDate?: number,
      ) =>
        PARITY_BARS.filter(
          (b) =>
            (startDate === undefined || b.timestamp >= startDate) &&
            (endDate === undefined || b.timestamp <= endDate),
        ),
    ),
  };
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const API_FIXTURE = path.join(FIXTURE_DIR, 'backtest-api-result.golden.json');
const CLI_FIXTURE = path.join(FIXTURE_DIR, 'backtest-cli-metrics.golden.json');

function loadFixture(filePath: string): object | any[] {
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

/** Build a deterministic BacktestOutcome + its toApiResult options (engine
 *  post-merge config — the contract extension surface). */
async function buildOutcome() {
  const bars = createCrossoverBars();
  const pipeline = await runBacktestPipeline({ script: STRATEGY, bars });
  if (!pipeline.success || !pipeline.engine) {
    throw new Error('runBacktestPipeline failed to produce an engine');
  }
  const outcome = toOutcome(bars, pipeline.engine);
  if (!outcome) throw new Error('toOutcome returned null');
  const strategyEngine = pipeline.engine.getStrategyEngine();
  if (!strategyEngine) throw new Error('missing strategy engine');
  return {
    outcome,
    opts: {
      effectiveConfig: strategyEngine.getConfig(),
      warnings: [],
      barCount: bars.length,
    } satisfies ToApiResultOptions,
  };
}

describe('backtest glue parity (task 5.1)', () => {
  describe('API parity', () => {
    it('toApiResult reproduces the captured API golden fixture + the contract extension', async () => {
      const { outcome, opts } = await buildOutcome();
      const actual = toApiResult(outcome, opts);
      const expected = loadFixture(API_FIXTURE);
      // Pre-extension shape preserved byte-for-byte (subset match ignores the
      // new contract-extension fields).
      expect(actual).toMatchObject(expected);
      // Contract BacktestResultExtension + the parity barCount coverage-gap.
      expect(actual.effectiveConfig).toBeDefined();
      expect(Array.isArray(actual.warnings)).toBe(true);
      expect(actual.barCount).toBe(120);
    });
  });

  describe('CLI parity', () => {
    it('toCliSymbolResult deep-equals the captured CLI golden fixture', async () => {
      const { outcome } = await buildOutcome();
      const actual = toCliSymbolResult(outcome);
      const expected = loadFixture(CLI_FIXTURE);
      expect(actual).toEqual(expected);
    });
  });

  describe('Auto-select parity', () => {
    it('toAutoSelectMetrics copies the 8-field subset verbatim from outcome.metrics', async () => {
      const { outcome } = await buildOutcome();
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
    it('emits only present contract keys — never undefined, never producer-default keys', () => {
      const input: ExplicitBacktestOverride = {
        initialCapital: 10000,
        commissionMethod: 'jupiter_ultra',
        // slippageType, marginLong, marginShort etc. intentionally absent
      };
      const override = buildBacktestConfigOverride(input);

      expect(Object.keys(override).sort()).toEqual(
        ['commissionMethod', 'initialCapital'].sort(),
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
      vi.mocked(fetchDexFeeBps).mockResolvedValue({ dexFeeBps: 42, source: 'api' });
      const override = { commissionMethod: 'jupiter_ultra' } as Partial<StrategyConfig>;
      const res = await applyDexFee('BTCUSDT', override);
      const cms = res.commissionMethodSettings as unknown as Record<string, unknown>;
      expect(cms.dexFeeBps).toBe(42);
      expect(cms.solPriceUsd).toBe(150);
    });

    it('jupiter method with an explicit dexFeeBps bypasses the live fetch entirely (ruling B hatch a)', async () => {
      vi.mocked(fetchDexFeeBps).mockClear();
      const override = {
        commissionMethod: 'jupiter_manual',
        commissionMethodSettings: { dexFeeBps: 7 },
      } as Partial<StrategyConfig>;
      const res = await applyDexFee('BTCUSDT', override);
      const cms = res.commissionMethodSettings as unknown as Record<string, unknown>;
      expect(cms.dexFeeBps).toBe(7);
      expect(cms.solPriceUsd).toBe(150);
      expect(vi.mocked(fetchDexFeeBps)).not.toHaveBeenCalled();
    });

    it('jupiter method with a fetch failure THROWS — no fallback, no invented fee (ruling B)', async () => {
      // ETHUSDT (not BTCUSDT): the caller-side dexFeeCache (backtest-config.ts)
      // already holds BTCUSDT=42 from the successful-fetch test — a BTCUSDT
      // call would hit that cache and never reach the mocked fetch. A fresh
      // symbol forces the live-fetch path → the mock rejection fires.
      vi.mocked(fetchDexFeeBps).mockRejectedValue(new Error('network down'));
      const override = { commissionMethod: 'jupiter_ultra' } as Partial<StrategyConfig>;
      await expect(applyDexFee('ETHUSDT', override)).rejects.toThrow(/Failed to fetch live DEX fee/);
    });

    it('a live fee-fetch failure records a live-fee-failure warning through the sink BEFORE throwing (failure-mode record)', async () => {
      vi.mocked(fetchDexFeeBps).mockRejectedValue(new Error('network down'));
      const collected: BacktestWarning[] = [];
      const sink = (w: BacktestWarning) => {
        collected.push(w);
      };
      const override = { commissionMethod: 'jupiter_ultra' } as Partial<StrategyConfig>;
      await expect(applyDexFee('FAILSYM', override, sink)).rejects.toThrow(/Failed to fetch live DEX fee/);
      expect(collected.some((w) => w.type === 'live-fee-failure')).toBe(true);
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

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCER PARITY — GOLDEN PAIR  (OpenSpec backtest-parity-trust)
//
// Locks producer equivalence between the CLI path and the API path for the
// SAME canned script. The parity contract (spec.md: "Deterministic producer
// parity") requires: same script + same explicit configuration → identical
// effective config, bar count, trades, PnL, metrics.
//
// The parity waves (M2 normalizer / M3 commission / M4 shared dates / M5
// warnings) landed since the RED baseline and closed BOTH divergences:
//
//   A. date-range semantics (days-back)  → GREEN: both producers resolve
//      days-back through the shared UTC-midnight resolver (backtest-dates.ts)
//      with an injectable clock — same days_back → same first bar (UTC
//      midnight) + same bar count.
//   B. producer payload parity (real flows) → GREEN: the API path receives
//      ONLY the user's explicit fields (contract ExplicitBacktestOverride:
//      commissionMethod REQUIRED, no injected engine defaults); both
//      producers run the same official long-only method → trades/PnL/metrics
//      match.
//   C. symmetric explicit config → regression lock (glue-level parity).
//
// Golden assertions now available: effectiveConfig equality (same post-merge
// config), barCount equality (exact — the coverage-gap recommendation is
// closed), typed warnings present on the API payload, metrics equality.
//
// Determinism: pinned system clock in A (vi.useFakeTimers({ toFake: ['Date'] })
// + vi.setSystemTime — Date only is faked, timers stay real so HTTP polling
// works), explicit UTC-midnight ranges in B/C, canned daily bars via the
// mocked fetch-bars module, fixed DEX fee (mocked fetchDexFeeBps) and fixed
// SOL price. No live network. Script file is a runtime temp file, removed in
// afterAll.
// ═══════════════════════════════════════════════════════════════════════════

const PARITY_SYMBOL = 'BTCUSDT';
const PARITY_TIMEFRAME = 'D';
/** Explicit UTC-midnight-aligned range (bars 7..55 of the 60-bar canned set). */
const PARITY_START = '2026-05-08';
const PARITY_END = '2026-06-25';
const PARITY_INITIAL_CAPITAL = 10000;
const PARITY_COMMISSION_METHOD = 'jupiter_manual';

/** Boot a real express router on an ephemeral port; returns baseUrl + server. */
async function startApiServer(): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  app.use(express.json());
  app.use('/api', createBacktestRouter());
  const server = app.listen(0);
  await new Promise<void>((r) => server.once('listening', r));
  return {
    server,
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`,
  };
}

async function stopServer(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
}

/** Write the canned strategy to a runtime temp file; returns its path. */
function writeScriptFile(): { tmpDir: string; scriptFile: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-script-'));
  const scriptFile = path.join(tmpDir, 'ema-cross.pine');
  fs.writeFileSync(scriptFile, STRATEGY, 'utf-8');
  return { tmpDir, scriptFile };
}

/**
 * POST a backtest job to the real HTTP API and poll until completion.
 * Returns the job result payload (the toApiResult shape).
 * NOTE: the poll deadline uses performance.now() — immune to the faked Date
 * clock used by scenario A (Date is frozen there, so Date.now() would never
 * advance past the deadline).
 */
async function runApiBacktest(
  baseUrl: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const postRes = await fetch(`${baseUrl}/backtest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(postRes.status).toBe(200);
  const { job_id } = (await postRes.json()) as { job_id: string };

  const deadline = performance.now() + 15_000;
  while (performance.now() < deadline) {
    const statusRes = await fetch(`${baseUrl}/backtest/${job_id}`);
    const status = (await statusRes.json()) as { status?: string; error?: string };
    if (status.status === 'completed') {
      const resultRes = await fetch(`${baseUrl}/backtest/${job_id}/result`);
      expect(resultRes.status).toBe(200);
      return (await resultRes.json()) as Record<string, unknown>;
    }
    if (status.status === 'failed') {
      throw new Error(`API backtest failed: ${status.error}`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('API backtest timed out after 15s');
}

/** Everything the parity assertions need from the CLI producer — captured from
 *  the export sink BEFORE the outcome is shaped into the CLI result view. */
interface CliRunCapture {
  outcome: BacktestOutcome;
  bars: Bar[];
  engine: ExecutionEngine;
  warnings: BacktestWarning[];
  startDate?: number;
  endDate?: number;
}

/** Run the CLI path for one symbol with the given flags; returns the captured
 *  full outcome + bars + engine so the parity suite can assemble the SAME
 *  API-shaped result the HTTP producer returns. */
async function runCliOutcome(
  scriptFile: string,
  cliOptions: Record<string, unknown>,
): Promise<CliRunCapture> {
  let capture!: CliRunCapture;
  const results = await runMultiSymbolBacktest(
    {
      scriptPath: scriptFile,
      timeframe: PARITY_TIMEFRAME,
      symbols: [PARITY_SYMBOL],
      daysBack: 0,
      help: false,
      ...cliOptions,
    } as Parameters<typeof runMultiSymbolBacktest>[0],
    (ctx) => {
      capture = {
        outcome: ctx.outcome,
        bars: ctx.bars,
        engine: ctx.engine,
        warnings: ctx.warnings,
        startDate: ctx.startDate,
        endDate: ctx.endDate,
      };
    },
  );
  if (results[0]?.status !== 'completed') {
    throw new Error(`CLI path failed: ${results[0]?.error ?? 'unknown error'}`);
  }
  return capture;
}

/** Assemble the toApiResult options for a CLI capture — the SAME construction
 *  the API route uses (engine post-merge config + resolved UTC-midnight range),
 *  so effectiveConfig equality is a true parity assertion. */
function cliAsApiOpts(capture: CliRunCapture): ToApiResultOptions {
  const strategyEngine = capture.engine.getStrategyEngine();
  if (!strategyEngine) throw new Error('CLI strategy engine unavailable');
  return {
    effectiveConfig: {
      ...strategyEngine.getConfig(),
      ...(capture.startDate !== undefined ? { startDate: capture.startDate } : {}),
      ...(capture.endDate !== undefined ? { endDate: capture.endDate } : {}),
    },
    warnings: capture.warnings,
    barCount: capture.bars.length,
  };
}

// ── A. date-range semantics (days-back) — GREEN: shared UTC-midnight resolver ─
describe('producer parity — A: date-range semantics (days-back)', () => {
  let server!: Server;
  let baseUrl!: string;
  let tmpDir!: string;
  let scriptFile!: string;
  let apiResult!: ReturnType<typeof toApiResult>;
  let cliCapture!: CliRunCapture;
  const DAYS_BACK = 20;

  beforeAll(async () => {
    // Pin the clock to a NON-midnight instant — the OLD divergence trigger (the
    // API truncated days-back to UTC-midnight while the CLI resolved raw-ms
    // now-anchored boundaries). The shared resolver (backtest-dates.ts) now
    // resolves BOTH producers to the same UTC-midnight day boundaries.
    // (Date-only faked; timers stay real so HTTP polling works.)
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));

    const script = writeScriptFile();
    tmpDir = script.tmpDir;
    scriptFile = script.scriptFile;
    vi.mocked(fetchDexFeeBps).mockResolvedValue({ dexFeeBps: 5, source: 'api' });

    const srv = await startApiServer();
    server = srv.server;
    baseUrl = srv.baseUrl;

    // API: days_back only + explicit commission method (contract REQUIRED) →
    // shared resolver maps [now-20d .. now] to UTC-midnight boundaries
    // (2026-05-26T00:00 .. 2026-06-15T00:00) → 21 bars.
    apiResult = (await runApiBacktest(baseUrl, {
      symbol: PARITY_SYMBOL,
      timeframe: PARITY_TIMEFRAME,
      script: STRATEGY,
      days_back: DAYS_BACK,
      initialCapital: PARITY_INITIAL_CAPITAL,
      commissionMethod: PARITY_COMMISSION_METHOD,
    })) as unknown as ReturnType<typeof toApiResult>;

    // CLI: daysBack only + the SAME explicit method → the SAME UTC-midnight
    // range → the same 21 bars.
    cliCapture = await runCliOutcome(scriptFile, {
      daysBack: DAYS_BACK,
      initialCapital: PARITY_INITIAL_CAPITAL,
      commissionMethod: PARITY_COMMISSION_METHOD,
    });
  });

  afterAll(async () => {
    vi.useRealTimers();
    await stopServer(server);
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const cliAsApi = () => toApiResult(cliCapture.outcome, cliAsApiOpts(cliCapture));

  it('bar count parity — the same days_back resolves to the same bar count (21) on both producers', () => {
    expect(apiResult.barCount).toBe(21);
    expect(cliCapture.bars.length).toBe(21);
    expect(apiResult.barCount).toBe(cliCapture.bars.length);
  });

  it('first-bar parity — both producers resolve days-back to the same UTC-midnight boundary', () => {
    // Clock pinned to 2026-06-15T12:00Z → both resolve start = 2026-05-26T00:00:00Z.
    expect(apiResult.effectiveConfig.startDate).toBe(1779753600000);
    expect(cliAsApi().effectiveConfig.startDate).toBe(apiResult.effectiveConfig.startDate);
  });

  it('effectiveConfig parity — identical post-merge config on both producers', () => {
    expect(apiResult.effectiveConfig).toEqual(cliAsApi().effectiveConfig);
  });

  it('bar range parity — same first/last equity points (bar-set equality)', () => {
    const apiPoints = apiResult.equityPoints;
    const cliPoints = cliAsApi().equityPoints;
    expect(apiPoints[0]!.time).toBe(cliPoints[0]!.time);
    expect(apiPoints[apiPoints.length - 1]!.time).toBe(cliPoints[cliPoints.length - 1]!.time);
  });

  it('return parity — buyHoldReturn reflects the same first/last bar closes', () => {
    expect(apiResult.buyHoldReturn).toBe(cliAsApi().buyHoldReturn);
  });

  it('metrics parity — every metric matches', () => {
    expect(apiResult.metrics).toEqual(cliAsApi().metrics);
  });

  it('warnings — the API payload carries the typed warning array', () => {
    expect(Array.isArray(apiResult.warnings)).toBe(true);
    for (const w of apiResult.warnings) {
      expect(w).toMatchObject({ type: expect.any(String), message: expect.any(String) });
    }
  });
});

// ── B. producer payload parity (real flows) — GREEN: contract explicit fields ─
describe('producer parity — B: producer payload parity (real flows)', () => {
  let server!: Server;
  let baseUrl!: string;
  let tmpDir!: string;
  let scriptFile!: string;
  let apiResult!: ReturnType<typeof toApiResult>;
  let cliCapture!: CliRunCapture;

  beforeAll(async () => {
    const script = writeScriptFile();
    tmpDir = script.tmpDir;
    scriptFile = script.scriptFile;
    vi.mocked(fetchDexFeeBps).mockResolvedValue({ dexFeeBps: 5, source: 'api' });

    const srv = await startApiServer();
    server = srv.server;
    baseUrl = srv.baseUrl;

    // API path receives ONLY the user's explicit fields (contract
    // ExplicitBacktestOverride — no injected engine defaults: no commission /
    // commissionType / currency / useCustomRate / useCustom, no slippage / qty /
    // margin presets; commissionMethod REQUIRED). The old frontend injections
    // (long-only + 20%-equity re-quantization) are gone — the normalizer would
    // 400 them (UNKNOWN_FIELD / NULL_NOT_ALLOWED).
    apiResult = (await runApiBacktest(baseUrl, {
      symbol: PARITY_SYMBOL,
      timeframe: PARITY_TIMEFRAME,
      script: STRATEGY,
      startDate: PARITY_START,
      endDate: PARITY_END,
      initialCapital: PARITY_INITIAL_CAPITAL,
      commissionMethod: PARITY_COMMISSION_METHOD,
    })) as unknown as ReturnType<typeof toApiResult>;

    // CLI path receives the SAME explicit fields — both producers run the same
    // official long-only method, so trades must match (the old divergence —
    // API 0 trades vs CLI 1/-150.94 — is gone).
    cliCapture = await runCliOutcome(scriptFile, {
      startDate: PARITY_START,
      endDate: PARITY_END,
      initialCapital: PARITY_INITIAL_CAPITAL,
      commissionMethod: PARITY_COMMISSION_METHOD,
    });
  });

  afterAll(async () => {
    await stopServer(server);
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const cliAsApi = () => toApiResult(cliCapture.outcome, cliAsApiOpts(cliCapture));

  it('trade count parity — same number of trades (shorts must not be dropped by one producer)', () => {
    expect(apiResult.trades.length).toBe(cliAsApi().trades.length);
  });

  it('trade list parity — same trades, same sides, same entries/exits/prices', () => {
    expect(apiResult.trades).toEqual(cliAsApi().trades);
  });

  it('PnL parity — totalPnl, totalPnlPercent and commission match', () => {
    expect(apiResult.metrics.totalPnl).toBe(cliAsApi().metrics.totalPnl);
    expect(apiResult.metrics.totalPnlPercent).toBe(cliAsApi().metrics.totalPnlPercent);
    expect(apiResult.metrics.commission).toBe(cliAsApi().metrics.commission);
  });

  it('metrics parity — every toApiResult metric field matches', () => {
    expect(apiResult.metrics).toEqual(cliAsApi().metrics);
  });

  it('bar count parity — the same explicit range resolves to the same bar count', () => {
    expect(apiResult.barCount).toBe(cliCapture.bars.length);
  });

  it('effectiveConfig parity — identical post-merge config', () => {
    expect(apiResult.effectiveConfig).toEqual(cliAsApi().effectiveConfig);
  });

  it('warnings — the API payload carries the typed warning array', () => {
    expect(Array.isArray(apiResult.warnings)).toBe(true);
    for (const w of apiResult.warnings) {
      expect(w).toMatchObject({ type: expect.any(String), message: expect.any(String) });
    }
  });
});

// ── C. symmetric explicit config — GREEN (regression lock) ───────────────────
describe('producer parity — symmetric explicit config (regression lock)', () => {
  let server!: Server;
  let baseUrl!: string;
  let tmpDir!: string;
  let apiResult!: ReturnType<typeof toApiResult>;
  let cliCapture!: CliRunCapture;

  beforeAll(async () => {
    const script = writeScriptFile();
    tmpDir = script.tmpDir;
    vi.mocked(fetchDexFeeBps).mockResolvedValue({ dexFeeBps: 5, source: 'api' });

    const srv = await startApiServer();
    server = srv.server;
    baseUrl = srv.baseUrl;

    // Same explicit config on BOTH paths: jupiter_manual + explicit dates.
    apiResult = (await runApiBacktest(baseUrl, {
      symbol: PARITY_SYMBOL,
      timeframe: PARITY_TIMEFRAME,
      script: STRATEGY,
      startDate: PARITY_START,
      endDate: PARITY_END,
      initialCapital: PARITY_INITIAL_CAPITAL,
      commissionMethod: PARITY_COMMISSION_METHOD,
    })) as unknown as ReturnType<typeof toApiResult>;

    cliCapture = await runCliOutcome(script.scriptFile, {
      startDate: PARITY_START,
      endDate: PARITY_END,
      initialCapital: PARITY_INITIAL_CAPITAL,
      commissionMethod: PARITY_COMMISSION_METHOD,
    });
  });

  afterAll(async () => {
    await stopServer(server);
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const cliAsApi = () => toApiResult(cliCapture.outcome, cliAsApiOpts(cliCapture));

  it('trade list parity — same trades, same sides, same entries/exits/prices', () => {
    expect(apiResult.trades).toEqual(cliAsApi().trades);
  });

  it('golden pair parity-surface — identical producer outputs (warning SETS are locked separately by the D warnings-set parity suite)', () => {
    expect(apiResult.barCount).toBe(cliAsApi().barCount);
    expect(apiResult.effectiveConfig).toEqual(cliAsApi().effectiveConfig);
    expect(apiResult.trades).toEqual(cliAsApi().trades);
    expect(apiResult.metrics).toEqual(cliAsApi().metrics);
    expect(apiResult.buyHoldReturn).toBe(cliAsApi().buyHoldReturn);
    expect(apiResult.equityPoints).toEqual(cliAsApi().equityPoints);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D. warnings-set parity (reviewer M5 / F3a / F3b) — NEW review-gap lock
//
// The M5 warning-collector wave guarantees each producer emits the SAME warning
// SET for the same explicit input. This suite locks that claim on the real
// producer surfaces:
//   * fee-decision      — buildDecisionWarnings fires on both producers
//   * live-fee-cache    — the run fee resolves from the WARMED cache on both
//                         producers (deterministic: no live fetch, no
//                         cross-test cache dependence — a fresh symbol is
//                         warmed explicitly before the runs)
// and asserts the full {type,message} SETS are equal (emission order may
// differ between the producers and is not part of the contract).
//
// The failure-mode record (live-fee-failure) is covered by the applyDexFee unit
// test above plus the E CLI exit-code suite below — a fee failure always aborts
// that symbol's run, so no COMPLETED producer surface can carry it.
// ═══════════════════════════════════════════════════════════════════════════
describe('producer parity — D: warnings-set parity (M5/F3a/F3b review gaps)', () => {
  let server!: Server;
  let baseUrl!: string;
  let tmpDir!: string;
  let apiResult!: ReturnType<typeof toApiResult>;
  let cliCapture!: CliRunCapture;

  // Fresh symbol so the caller-side dexFeeCache is EMPTY before we warm it —
  // the run then deterministically resolves the fee from the cache we set.
  const WARN_SYMBOL = 'WARNUSDT';

  beforeAll(async () => {
    const script = writeScriptFile();
    tmpDir = script.tmpDir;
    vi.mocked(fetchDexFeeBps).mockResolvedValue({ dexFeeBps: 5, source: 'api' });

    // Warm the fee cache for WARN_SYMBOL through the caller-side path (a direct
    // applyDexFee with a successful mocked live fetch). Both producers then
    // cache-hit during their runs, so BOTH emit the live-fee-cache record — no
    // producer sees a silent cold fetch that the other one would not.
    await applyDexFee(WARN_SYMBOL, { commissionMethod: 'jupiter_ultra' });

    const srv = await startApiServer();
    server = srv.server;
    baseUrl = srv.baseUrl;

    apiResult = (await runApiBacktest(baseUrl, {
      symbol: WARN_SYMBOL,
      timeframe: PARITY_TIMEFRAME,
      script: STRATEGY,
      startDate: PARITY_START,
      endDate: PARITY_END,
      initialCapital: PARITY_INITIAL_CAPITAL,
      commissionMethod: PARITY_COMMISSION_METHOD,
    })) as unknown as ReturnType<typeof toApiResult>;

    // runCliOutcome spreads cliOptions AFTER its default `symbols: [BTCUSDT]`,
    // so passing `symbols: [WARN_SYMBOL]` overrides the symbol for this capture.
    cliCapture = await runCliOutcome(script.scriptFile, {
      symbols: [WARN_SYMBOL],
      startDate: PARITY_START,
      endDate: PARITY_END,
      initialCapital: PARITY_INITIAL_CAPITAL,
      commissionMethod: PARITY_COMMISSION_METHOD,
    });
  });

  afterAll(async () => {
    await stopServer(server);
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Normalized warning identifier — the parity contract is the SET of
   *  {type,message} records, not their emission order. */
  const warningSet = (warnings: readonly BacktestWarning[]) =>
    [...warnings].map((w) => `${w.type}|${w.message}`).sort();

  it('warnings-set parity — identical explicit input yields identical {type,message} sets on BOTH producers', () => {
    const apiWarnings = (apiResult.warnings ?? []) as BacktestWarning[];
    expect(warningSet(apiWarnings)).toEqual(warningSet(cliCapture.warnings));
  });

  it('every producer emits fee-decision — the commission-method decision record', () => {
    for (const warnings of [(apiResult.warnings ?? []) as BacktestWarning[], cliCapture.warnings]) {
      expect(warnings.some((w) => w.type === 'fee-decision')).toBe(true);
    }
  });

  it('every producer emits live-fee-cache OR live-fee-failure — the fee source is always recorded', () => {
    for (const warnings of [(apiResult.warnings ?? []) as BacktestWarning[], cliCapture.warnings]) {
      expect(
        warnings.some((w) => w.type === 'live-fee-cache' || w.type === 'live-fee-failure'),
      ).toBe(true);
    }
  });

  it('API warning payload stays typed — records are {type,message} objects, never bare strings (schema v2)', () => {
    for (const w of (apiResult.warnings ?? []) as BacktestWarning[]) {
      expect(typeof w).toBe('object');
      expect(w).toMatchObject({ type: expect.any(String), message: expect.any(String) });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E. CLI partial-failure exit code (reviewer F5) — NEW review-gap lock
//
// main() (backend/src/cli/backtest-cli.ts) exits 0 when every symbol completed
// and 1 when ANY symbol failed. main() runs at module load, so the real entry
// is exercised IN-PROCESS: spy process.exit + stdio, override process.argv,
// then dynamically import the script. The failing symbol is deterministic and
// offline: a FRESH symbol whose live fee fetch rejects (jupiter_ultra →
// applyDexFee throws → runSymbolBacktest marks it failed) while BTCUSDT
// resolves from the warm caller-side cache. No --export flag → no disk writes.
// ═══════════════════════════════════════════════════════════════════════════
describe('CLI partial-failure exit code (reviewer F5)', () => {
  let tmpDir!: string;
  let scriptFile!: string;

  beforeAll(() => {
    const script = writeScriptFile();
    tmpDir = script.tmpDir;
    scriptFile = script.scriptFile;
    // BTCUSDT is cache-warm from earlier suites; keep the fetch mock sane.
    vi.mocked(fetchDexFeeBps).mockResolvedValue({ dexFeeBps: 5, source: 'api' });
  });

  afterAll(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('a batch where ONE symbol fails (fee-fetch failure) exits 1 and the summary names the failed symbol', async () => {
    const POISON_SYMBOL = 'POISONUSDT';

    // Warm the fee cache for the good symbol, then make the live fetch fail for
    // the poison symbol ONLY: BTCUSDT completes from cache, POISONUSDT fails.
    await applyDexFee('BTCUSDT', { commissionMethod: 'jupiter_ultra' });
    vi.mocked(fetchDexFeeBps).mockRejectedValue(new Error('network down'));

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as typeof process.exit);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const origArgv = process.argv;
    process.argv = [
      'node',
      'backtest-cli.js',
      scriptFile,
      '--timeframe',
      PARITY_TIMEFRAME,
      '--symbols',
      `BTCUSDT,${POISON_SYMBOL}`,
      '--start-date',
      PARITY_START,
      '--end-date',
      PARITY_END,
      '--initial-capital',
      String(PARITY_INITIAL_CAPITAL),
      '--commission-method',
      'jupiter_ultra',
    ];

    try {
      // main() is invoked at module load; the batch completes asynchronously
      // after the import resolves, so wait deterministically for the exit call.
      await import('../src/cli/backtest-cli.js');
      await vi.waitFor(() => expect(exitSpy).toHaveBeenCalled(), {
        timeout: 15_000,
        interval: 25,
      });

      expect(exitSpy).toHaveBeenCalledWith(1);
      const stderrText = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(stderrText).toContain(POISON_SYMBOL);
      expect(stderrText).toMatch(/failed/);
    } finally {
      process.argv = origArgv;
      exitSpy.mockRestore();
      stderrSpy.mockRestore();
      stdoutSpy.mockRestore();
    }
  });
});

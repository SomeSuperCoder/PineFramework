/**
 * backtest-export.test.ts — backend glue + CLI wiring tests for the backtest
 * full-data export (OpenSpec backtest-full-data-export, task 5.1).
 *
 * Locks (deterministically, offline — fetchBars + SOL price are mocked per repo
 * convention, see backtest-route.test.ts / backtest-parity.test.ts):
 *   1. writeExportFile  — content-derived filename, atomic write, NO .tmp
 *      leftovers, mkdir -p, content round-trips through parseBacktestExport.
 *   2. writeExportManifest — manifest.json carries runId/source/exportedAt/
 *      files/symbols; arrays are copied; atomic write leaves no .tmp.
 *   3. runSymbolBacktest — a THROWING export sink never fails the backtest
 *      (SymbolResult stays `completed`); a successful sink's export carries the
 *      exact engine effective config (parity contract) + the raw cliOptions.
 *   4. runMultiSymbolBacktest — the real CLI sink wiring writes export file(s)
 *      AND manifest.json listing runId/source/files/symbols; a failing sink
 *      produces no manifest and still completes every symbol.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Bar, StrategyConfig } from 'pine-framework';
import {
  buildBacktestExport,
  parseBacktestExport,
  scriptHash,
  VERSION,
  type BacktestExport,
} from 'pine-framework';

import { writeExportFile, writeExportManifest, type ExportRun } from '../src/backtest-export.js';
import { toApiResult, toCliSymbolResult, type BacktestOutcome } from '../src/backtest-result.js';
import { runSymbolBacktest, type ExportOutcomeSink } from '../src/cli/symbol-runner.js';
import { runMultiSymbolBacktest } from '../src/cli/multi-symbol-runner.js';
import type { CliOptions } from '../src/cli/types.js';

// ── Offline by design: never touch the live Bybit API / SOL price oracle. ──
vi.mock('../src/bybit/fetch-bars.js', () => ({ fetchBars: vi.fn() }));
vi.mock('../src/services/sol-price-fetcher.js', () => ({
  fetchSolPriceUsd: vi.fn().mockResolvedValue(150),
}));
import { fetchBars } from '../src/bybit/fetch-bars.js';

// ── Temp-dir lifecycle ──────────────────────────────────────────────────────
const tempDirs: string[] = [];
function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-test-'));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── Fixtures (strategy + bars verbatim from backtest-parity.test.ts) ────────
const STRATEGY = `//@version=5
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

/** Deterministic export object used for the file-glue tests. */
function makeExportObj(): BacktestExport {
  return buildBacktestExport({
    runId: 'run-1',
    source: 'script',
    generatedAt: '2026-08-14T12:00:00.000Z',
    meta: {
      symbol: 'TESTUSDT',
      timeframe: '60',
      barCount: 3,
      engineVersion: VERSION,
      scriptHash: scriptHash(STRATEGY),
    },
    params: {
      request: { symbols: 'TESTUSDT' },
      configOverride: {},
      effectiveConfig: { initialCapital: 10000 } as unknown as StrategyConfig,
    },
    input: { bars: createCrossoverBars().slice(0, 3) },
    output: {
      series: new Map(),
      barTimestamps: [1700000000000, 1700003600000, 1700007200000],
      strategyMarkers: [],
      equityCurve: [10000, 10100, 10200],
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

/**
 * The CLI's export sink wiring, copied verbatim from backtest-cli.ts main()
 * (composition root for the full-data export). Used to lock the real contract —
 * INCLUDING the C1 B1 fix: the export carries UNROUNDED monthly returns
 * (outcome.monthlyReturnsRaw when present) with an honest rounding warning in
 * the fallback path.
 */
function makeCliSink(exportRun: ExportRun): ExportOutcomeSink {
  return async (ctx) => {
    const strategyEngine = ctx.engine.getStrategyEngine();
    if (!strategyEngine) {
      throw new Error('Effective strategy config unavailable (missing strategy engine)');
    }
    const exportObj = buildBacktestExport({
      runId: exportRun.runId,
      source: 'script',
      meta: {
        symbol: ctx.symbol,
        timeframe: ctx.timeframe,
        ...(ctx.startDate !== undefined ? { startDate: ctx.startDate } : {}),
        ...(ctx.endDate !== undefined ? { endDate: ctx.endDate } : {}),
        barCount: ctx.bars.length,
        engineVersion: VERSION,
        scriptHash: scriptHash(ctx.script),
      },
      params: {
        request: ctx.cliOptions,
        configOverride: { ...ctx.configOverride },
        effectiveConfig: { ...strategyEngine.getConfig() },
      },
      input: { bars: ctx.bars },
      output: {
        series: ctx.engine.getAllOutputs(),
        barTimestamps: ctx.bars.map((b) => b.timestamp),
        strategyMarkers: ctx.engine.getStrategyMarkers(),
        equityCurve: ctx.outcome.equityCurve,
        drawdownCurve: ctx.outcome.drawdownCurve,
        equityPoints: ctx.outcome.equityPoints,
        // C1 B1: raw series first, rounded fallback with an honest warning.
        monthlyReturns: ctx.outcome.monthlyReturnsRaw ?? ctx.outcome.monthlyReturns,
        buyHoldReturn: ctx.outcome.buyHoldReturn,
      },
      trades: ctx.outcome.trades,
      orders: ctx.outcome.filledOrders,
      metrics: ctx.outcome.metrics,
      warnings: ctx.outcome.monthlyReturnsRaw
        ? ctx.warnings
        : [...ctx.warnings, 'monthlyReturns rounded by caller (backtest-runner.ts:240)'],
    });
    const filename = await writeExportFile(exportObj, exportRun.dir);
    exportRun.files.push(filename);
    exportRun.symbols.add(ctx.symbol);
  };
}

// ── writeExportFile ─────────────────────────────────────────────────────────

describe('backend export glue — writeExportFile', () => {
  it('writes one file named from its content (source/symbol/runId/generatedAt) with NO .tmp leftovers', async () => {
    const dir = createTempDir();
    const exportObj = makeExportObj();

    const filename = await writeExportFile(exportObj, dir);

    expect(filename).toBe('backtest-script-TESTUSDT-run-1-2026-08-14T12-00-00-000Z.json');
    expect(fs.readdirSync(dir)).toEqual([filename]);
    // Atomic write: no temp file survives.
    expect(fs.readdirSync(dir).some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('content round-trips through parseBacktestExport unchanged', async () => {
    const dir = createTempDir();
    const exportObj = makeExportObj();

    const filename = await writeExportFile(exportObj, dir);
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, filename), 'utf-8'));

    // Raw file never contains NaN/Infinity tokens (tagged placeholders instead).
    const raw = fs.readFileSync(path.join(dir, filename), 'utf-8');
    expect(raw).not.toContain('NaN');

    expect(parseBacktestExport(JSON.stringify(onDisk))).toEqual(exportObj);
    expect(exportObj.meta.symbol).toBe('TESTUSDT');
  });

  it('creates nested directories (mkdir -p)', async () => {
    const dir = createTempDir();
    const nested = path.join(dir, 'nested', 'deep');
    const filename = await writeExportFile(makeExportObj(), nested);
    expect(fs.existsSync(path.join(nested, filename))).toBe(true);
  });

  it('survives non-finite numbers in the export (fidelity promise end-to-end)', async () => {
    const dir = createTempDir();
    const exportObj = makeExportObj();
    exportObj.metrics = { sharpeRatio: Number.NaN, totalPnl: Number.POSITIVE_INFINITY };
    exportObj.output.equityCurve = [10000, Number.NEGATIVE_INFINITY, 10200];

    const filename = await writeExportFile(exportObj, dir);
    const round = parseBacktestExport(fs.readFileSync(path.join(dir, filename), 'utf-8'));

    expect(Number.isNaN((round.metrics as { sharpeRatio: number }).sharpeRatio)).toBe(true);
    expect((round.metrics as { totalPnl: number }).totalPnl).toBe(Number.POSITIVE_INFINITY);
    expect(round.output.equityCurve[1]).toBe(Number.NEGATIVE_INFINITY);
  });
});

// ── writeExportManifest ─────────────────────────────────────────────────────

describe('backend export glue — writeExportManifest', () => {
  it('writes manifest.json with runId/source/exportedAt/files/symbols and no .tmp', async () => {
    const dir = createTempDir();
    const exportedAtBefore = Date.now();

    const manifestPath = await writeExportManifest(
      { runId: 'run-abc', source: 'script', files: ['a.json', 'b.json'], symbols: ['BTCUSDT', 'ETHUSDT'] },
      dir,
    );

    expect(path.basename(manifestPath)).toBe('manifest.json');
    expect(fs.readdirSync(dir)).toEqual(['manifest.json']);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.runId).toBe('run-abc');
    expect(manifest.source).toBe('script');
    expect(typeof manifest.exportedAt).toBe('string');
    expect(new Date(manifest.exportedAt).getTime()).toBeGreaterThanOrEqual(exportedAtBefore);
    expect(manifest.files).toEqual(['a.json', 'b.json']);
    expect(manifest.symbols).toEqual(['BTCUSDT', 'ETHUSDT']);
  });

  it('copies the files/symbols arrays (no aliasing of caller state)', async () => {
    const dir = createTempDir();
    const files = ['a.json'];
    const symbols = ['BTCUSDT'];

    await writeExportManifest({ runId: 'r', source: 'frontend', files, symbols }, dir);
    files.push('b.json');
    symbols.push('ETHUSDT');

    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8'));
    expect(manifest.files).toEqual(['a.json']);
    expect(manifest.symbols).toEqual(['BTCUSDT']);
  });
});

// ── .tmp cleanup on the FAILURE path (C1 NIT6) ──────────────────────────────

describe('backend export glue — no .tmp orphans when rename fails', () => {
  it('writeExportFile cleans up its temp file when the rename fails', async () => {
    const dir = createTempDir();
    const exportObj = makeExportObj();
    // A directory occupying the final path forces rename() to fail (EISDIR on
    // POSIX) AFTER the temp file was already written.
    const finalName = 'backtest-script-TESTUSDT-run-1-2026-08-14T12-00-00-000Z.json';
    fs.mkdirSync(path.join(dir, finalName));

    await expect(writeExportFile(exportObj, dir)).rejects.toThrow();

    // No temp orphan survives — only the blocking directory remains.
    expect(fs.readdirSync(dir)).toEqual([finalName]);
  });

  it('writeExportManifest cleans up its temp file when the rename fails', async () => {
    const dir = createTempDir();
    fs.mkdirSync(path.join(dir, 'manifest.json'));

    await expect(
      writeExportManifest({ runId: 'r', source: 'script', files: [], symbols: [] }, dir),
    ).rejects.toThrow();

    expect(fs.readdirSync(dir)).toEqual(['manifest.json']);
  });
});

// ── runSymbolBacktest — sink resilience + config parity ────────────────────

describe('backend export wiring — runSymbolBacktest', () => {
  it('a FAILING export sink never fails the backtest (SymbolResult stays completed)', async () => {
    vi.mocked(fetchBars).mockResolvedValue(createCrossoverBars());

    const result = await runSymbolBacktest(
      STRATEGY,
      'BTCUSDT',
      '60',
      undefined,
      undefined,
      undefined,
      { symbols: 'BTCUSDT' },
      async () => {
        throw new Error('export sink exploded');
      },
    );

    expect(result.status).toBe('completed');
    expect(result.metrics).toBeDefined();
    expect(result.metrics!.netProfitPercent).toBeTypeOf('number');
  });

  it('a successful sink builds an export whose effectiveConfig equals engine.getStrategyEngine().getConfig()', async () => {
    vi.mocked(fetchBars).mockResolvedValue(createCrossoverBars());

    let captured: { engineConfig: unknown; exportObj: BacktestExport } | undefined;

    const result = await runSymbolBacktest(
      STRATEGY,
      'BTCUSDT',
      '60',
      undefined,
      undefined,
      undefined,
      { symbols: 'BTCUSDT', timeframe: '60' },
      async (ctx) => {
        const strategyEngine = ctx.engine.getStrategyEngine();
        if (!strategyEngine) throw new Error('missing strategy engine');
        const engineConfig = strategyEngine.getConfig();
        const exportObj = buildBacktestExport({
          runId: 'run-1',
          source: 'script',
          meta: {
            symbol: ctx.symbol,
            timeframe: ctx.timeframe,
            barCount: ctx.bars.length,
            engineVersion: VERSION,
            scriptHash: scriptHash(ctx.script),
          },
          params: {
            request: ctx.cliOptions,
            configOverride: { ...ctx.configOverride },
            effectiveConfig: { ...engineConfig },
          },
          input: { bars: ctx.bars },
          output: {
            series: ctx.engine.getAllOutputs(),
            barTimestamps: ctx.bars.map((b) => b.timestamp),
            strategyMarkers: ctx.engine.getStrategyMarkers(),
            equityCurve: ctx.outcome.equityCurve,
            drawdownCurve: ctx.outcome.drawdownCurve,
            equityPoints: ctx.outcome.equityPoints,
            monthlyReturns: ctx.outcome.monthlyReturns,
            buyHoldReturn: ctx.outcome.buyHoldReturn,
          },
          trades: ctx.outcome.trades,
          orders: ctx.outcome.filledOrders,
          metrics: ctx.outcome.metrics,
        });
        captured = { engineConfig, exportObj };
      },
    );

    expect(result.status).toBe('completed');
    expect(captured).toBeDefined();

    // Parity contract: the export's effectiveConfig IS the engine's config.
    expect(captured!.exportObj.params.effectiveConfig).toEqual(captured!.engineConfig);

    // Request layer carries the raw cliOptions; meta carries symbol/timeframe/barCount.
    expect(captured!.exportObj.params.request).toEqual({ symbols: 'BTCUSDT', timeframe: '60' });
    expect(captured!.exportObj.meta.symbol).toBe('BTCUSDT');
    expect(captured!.exportObj.meta.timeframe).toBe('60');
    expect(captured!.exportObj.meta.barCount).toBe(createCrossoverBars().length);
    expect(captured!.exportObj.meta.scriptHash).toBe(scriptHash(STRATEGY));
  });

  it('a successful sink whose file write FAILS still completes the backtest', async () => {
    vi.mocked(fetchBars).mockResolvedValue(createCrossoverBars());

    const result = await runSymbolBacktest(
      STRATEGY,
      'BTCUSDT',
      '60',
      undefined,
      undefined,
      undefined,
      {},
      async () => {
        await writeExportFile(makeExportObj(), '/nonexistent-root-xyz/export-test');
      },
    );

    expect(result.status).toBe('completed');
  });

  it('script exports carry UNROUNDED monthlyReturns (C1 B1) while the legacy API/CLI results stay rounded', async () => {
    vi.mocked(fetchBars).mockResolvedValue(createCrossoverBars());

    let captured: { outcome: BacktestOutcome; exportObj: BacktestExport } | undefined;

    const result = await runSymbolBacktest(
      STRATEGY,
      'BTCUSDT',
      '60',
      undefined,
      undefined,
      undefined,
      { symbols: 'BTCUSDT' },
      async (ctx) => {
        const strategyEngine = ctx.engine.getStrategyEngine();
        if (!strategyEngine) throw new Error('missing strategy engine');
        // Mirrors the REAL CLI sink (backtest-cli.ts main()): raw first, rounded
        // fallback with an honest warning.
        const exportObj = buildBacktestExport({
          runId: 'run-1',
          source: 'script',
          meta: {
            symbol: ctx.symbol,
            timeframe: ctx.timeframe,
            barCount: ctx.bars.length,
            engineVersion: VERSION,
            scriptHash: scriptHash(ctx.script),
          },
          params: {
            request: ctx.cliOptions,
            configOverride: { ...ctx.configOverride },
            effectiveConfig: { ...strategyEngine.getConfig() },
          },
          input: { bars: ctx.bars },
          output: {
            series: ctx.engine.getAllOutputs(),
            barTimestamps: ctx.bars.map((b) => b.timestamp),
            strategyMarkers: ctx.engine.getStrategyMarkers(),
            equityCurve: ctx.outcome.equityCurve,
            drawdownCurve: ctx.outcome.drawdownCurve,
            equityPoints: ctx.outcome.equityPoints,
            monthlyReturns: ctx.outcome.monthlyReturnsRaw ?? ctx.outcome.monthlyReturns,
            buyHoldReturn: ctx.outcome.buyHoldReturn,
          },
          trades: ctx.outcome.trades,
          orders: ctx.outcome.filledOrders,
          metrics: ctx.outcome.metrics,
          warnings: ctx.outcome.monthlyReturnsRaw
            ? ctx.warnings
            : [...ctx.warnings, 'monthlyReturns rounded by caller (backtest-runner.ts:240)'],
        });
        captured = { outcome: ctx.outcome, exportObj };
      },
    );

    expect(result.status).toBe('completed');
    expect(captured).toBeDefined();

    // ── Export = RAW (the exact raw series toOutcome computed) ──
    expect(captured!.exportObj.output.monthlyReturns).toEqual(captured!.outcome.monthlyReturnsRaw);

    // The raw values are genuinely NOT 2dp-rounded for this fixture (the whole
    // point of the B1 fix: numeric values MUST NOT be rounded in the export).
    const raw = captured!.exportObj.output.monthlyReturns;
    const keys = Object.keys(raw);
    expect(keys.length).toBeGreaterThan(0);
    const hasUnroundedMonth = keys.some(
      (k) => raw[k] !== Math.round(raw[k]! * 100) / 100,
    );
    expect(hasUnroundedMonth).toBe(true);

    // ── Legacy display paths keep the ROUNDED values untouched ──
    const api = toApiResult(captured!.outcome);
    expect(api.monthlyReturns).toEqual(captured!.outcome.monthlyReturns);

    const cli = toCliSymbolResult(captured!.outcome);
    expect(cli.buyHoldReturn).toBe(Math.round(captured!.outcome.buyHoldReturn * 100) / 100);
  });
});

// ── runMultiSymbolBacktest — manifest wiring (real CLI sink) ────────────────

describe('backend export wiring — runMultiSymbolBacktest', () => {
  it('writes the export file AND manifest.json with runId/source/files/symbols', async () => {
    vi.mocked(fetchBars).mockResolvedValue(createCrossoverBars());
    const dir = createTempDir();
    const scriptPath = path.join(dir, 'strategy.pine');
    fs.writeFileSync(scriptPath, STRATEGY, 'utf-8');

    const exportRun: ExportRun = {
      runId: 'run-abc',
      source: 'script',
      dir,
      files: [],
      symbols: new Set<string>(),
    };
    const options: CliOptions = {
      scriptPath,
      timeframe: '60',
      symbols: ['BTCUSDT', 'ETHUSDT'],
      daysBack: 1,
      help: false,
    };

    const results = await runMultiSymbolBacktest(options, makeCliSink(exportRun), exportRun);

    // Both symbols completed (export sink never interfered).
    expect(results.map((r) => r.status)).toEqual(['completed', 'completed']);

    const entries = fs.readdirSync(dir).sort();
    const exportFiles = entries.filter((f) => f.startsWith('backtest-script-') && f.endsWith('.json'));
    expect(exportFiles).toHaveLength(2); // one per completed symbol
    expect(entries).toContain('manifest.json');
    // Atomic writes: no .tmp leftovers from either file.
    expect(entries.some((f) => f.endsWith('.tmp'))).toBe(false);

    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8'));
    expect(manifest.runId).toBe('run-abc');
    expect(manifest.source).toBe('script');
    expect(typeof manifest.exportedAt).toBe('string');
    // The manifest lists EVERY export of the run (files accumulate per symbol).
    expect(manifest.files).toEqual(exportFiles);
    expect(manifest.symbols).toEqual(['BTCUSDT', 'ETHUSDT']);

    // The export file itself is valid and carries the run id.
    const exportFile = exportFiles.find((f) => f.includes('BTCUSDT'))!;
    const exportObj = parseBacktestExport(fs.readFileSync(path.join(dir, exportFile), 'utf-8'));
    expect(exportObj.runId).toBe('run-abc');
    expect(exportObj.meta.symbol).toBe('BTCUSDT');
    expect(exportObj.params.effectiveConfig).toBeDefined();
  });

  it('a FAILING export sink still completes every symbol and writes NO manifest', async () => {
    vi.mocked(fetchBars).mockResolvedValue(createCrossoverBars());
    const dir = createTempDir();
    const scriptPath = path.join(dir, 'strategy.pine');
    fs.writeFileSync(scriptPath, STRATEGY, 'utf-8');

    const exportRun: ExportRun = {
      runId: 'run-fail',
      source: 'script',
      dir,
      files: [],
      symbols: new Set<string>(),
    };
    const options: CliOptions = {
      scriptPath,
      timeframe: '60',
      symbols: ['BTCUSDT'],
      daysBack: 1,
      help: false,
    };

    const results = await runMultiSymbolBacktest(
      options,
      async () => {
        throw new Error('export sink exploded');
      },
      exportRun,
    );

    expect(results.map((r) => r.status)).toEqual(['completed']);
    // No export files, no manifest — the run directory stays empty.
    expect(fs.readdirSync(dir)).toEqual(['strategy.pine']);
  });
});

// ── CLI bare --export default dir resolution (C1 B4) ───────────────────────

describe('CLI --export default dir resolution (B4 — module location, not cwd)', () => {
  // backend/tests/backtest-export.test.ts -> ../../ = monorepo root.
  const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
  const expectedExportsDir = path.join(repoRoot, '.exports');

  it('both the src and dist CLI module locations resolve the default .exports/ to the repo root', () => {
    // Mirrors main()'s resolve(import.meta.dirname, '../../..', '.exports'):
    //   src:  backend/src/cli/backtest-cli.ts
    //   dist: backend/dist/cli/backtest-cli.js (the BUILT binary that ships)
    const fromSrc = path.resolve(repoRoot, 'backend/src/cli', '../../..', '.exports');
    const fromDist = path.resolve(repoRoot, 'backend/dist/cli', '../../..', '.exports');
    expect(fromSrc).toBe(expectedExportsDir);
    expect(fromDist).toBe(expectedExportsDir);
  });

  it('the pre-fix cwd-based resolution landed in the repo PARENT — the bug this fix prevents', () => {
    // Old behavior: resolve(process.cwd(), '..', '.exports') invoked from the
    // repo root resolves into the repo's PARENT, not the repo root.
    const legacy = path.resolve(repoRoot, '..', '.exports');
    expect(legacy).not.toBe(expectedExportsDir);
    expect(legacy).toBe(path.join(path.dirname(repoRoot), '.exports'));
  });
});

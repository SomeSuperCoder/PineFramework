/**
 * backtest-export.test.ts — lib unit tests for the backtest full-data export
 * contract (OpenSpec backtest-full-data-export, task 5.1).
 *
 * Locks the FIDELITY PROMISE of src/export/backtest-export.ts:
 *   - serializeBacktestExport / parseBacktestExport round-trip NaN and ±Infinity
 *     through tagged placeholders while finite values survive EXACTLY.
 *   - computeInputFingerprint is deterministic and sensitive to bar drift.
 *   - scriptHash matches the NIST FIPS 180-4 vectors.
 *   - exportFilename follows `backtest-<source>-<symbol>-<runId>-<ISO-timestamp>.json`.
 *   - buildBacktestExport FAILS (throws) when params.effectiveConfig is missing.
 *   - the builder copies (never aliases) engine-owned arrays.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import type { Bar } from 'pine-framework';
// Series must come from src (not the pine-framework dist build) — the export
// module's Map<string, Series> is typed against src; dist types are nominal
// via the NA unique symbol and never assignable across builds.
import type { Series } from '../../src/language/runtime/series.js';
import {
  BACKTEST_EXPORT_SCHEMA_VERSION,
  buildBacktestExport,
  computeInputFingerprint,
  exportFilename,
  parseBacktestExport,
  scriptHash,
  serializeBacktestExport,
  type BacktestExport,
  type BacktestExportContext,
} from '../../src/export/backtest-export.js';
import type { StrategyConfig } from '../../src/strategy/strategy-engine.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Minimal valid effective config (shape is not load-bearing for the builder). */
const EFFECTIVE_CONFIG = {
  type: 'strategy',
  title: 'Test Strategy',
  initialCapital: 10000,
  commission: 0,
  slippage: 1.5,
} as unknown as StrategyConfig;

function makeSeries(name: string, values: number[]): Series {
  return { name, values, length: values.length } as unknown as Series;
}

function makeBars(): Bar[] {
  return [
    { timestamp: 1_700_000_000_000, open: 100, high: 105, low: 99, close: 103.5, volume: 1000 },
    { timestamp: 1_700_003_600_000, open: 103.5, high: 108.25, low: 102, close: 107, volume: 1200 },
    { timestamp: 1_700_007_200_000, open: 107, high: 109, low: 106.5, close: 106.5, volume: 900 },
  ];
}

function makeContext(overrides?: Partial<BacktestExportContext>): BacktestExportContext {
  return {
    runId: 'run-1',
    source: 'script',
    generatedAt: '2026-08-14T12:00:00.000Z',
    meta: {
      symbol: 'BTCUSDT',
      timeframe: '60',
      engineVersion: '0.1.0',
      scriptHash: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    },
    params: {
      request: { symbols: 'BTCUSDT', timeframe: '60' },
      configOverride: { initialCapital: 20000 },
      effectiveConfig: EFFECTIVE_CONFIG,
    },
    input: { bars: makeBars() },
    output: {
      series: new Map<string, Series>([
        ['close', makeSeries('close', [103.5, 107, 106.5])],
        ['ema', makeSeries('ema', [102.125, 104.75, 105.25])],
      ]),
      barTimestamps: [1_700_000_000_000, 1_700_003_600_000, 1_700_007_200_000],
      strategyMarkers: [{ type: 'entry', name: 'Long', barIndex: 1 }],
      equityCurve: [10000, 10150, 10200],
      drawdownCurve: [0, -1.5, -2.25],
      equityPoints: [{ time: 1_700_000_000_000, equity: 10000 }],
      monthlyReturns: { '2026-08': 2.5 },
      buyHoldReturn: 6.5,
    },
    trades: [{ id: 't1', pnl: 150 }],
    orders: [{ id: 'o1', qty: 1 }],
    metrics: { totalPnl: 200, sharpeRatio: 1.2 },
    warnings: [{ type: 'export-failure', message: 'na values present' }],
    ...overrides,
  };
}

/** Assert every number in a parsed-JSON tree is finite (no NaN/Infinity leaked). */
function assertAllNumbersFinite(value: unknown): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value)).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertAllNumbersFinite(item);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) assertAllNumbersFinite(item);
  }
}

// ── Round-trip fidelity (D2) ────────────────────────────────────────────────

describe('backtest-export lib — round-trip fidelity', () => {
  it('round-trips NaN, Infinity, -Infinity and finite values exactly', () => {
    const ctx = makeContext({
      input: {
        bars: [
          // NaN in close, Infinity in high, -Infinity in low, exact finite value.
          {
            timestamp: 1,
            open: Number.NaN,
            high: Number.POSITIVE_INFINITY,
            low: Number.NEGATIVE_INFINITY,
            close: 123.456789,
            volume: 0,
          } as unknown as Bar,
          ...makeBars(),
        ],
      },
      output: {
        series: new Map<string, Series>([
          [
            'plot',
            makeSeries('plot', [
              1.5,
              Number.NaN,
              Number.POSITIVE_INFINITY,
              Number.NEGATIVE_INFINITY,
              0,
            ]),
          ],
        ]),
        barTimestamps: [1, 2, 3],
        strategyMarkers: [{ price: Number.NaN }],
        equityCurve: [1000, Number.NaN, Number.NEGATIVE_INFINITY],
        drawdownCurve: [0, -5.25, Number.POSITIVE_INFINITY],
        equityPoints: [{ time: 1, equity: Number.NaN }],
        monthlyReturns: { '2026-01': Number.POSITIVE_INFINITY, '2026-02': 5.5 },
        buyHoldReturn: Number.NEGATIVE_INFINITY,
      },
      trades: [{ pnl: Number.NaN }],
      orders: [{ qty: Number.POSITIVE_INFINITY }],
      metrics: { sharpeRatio: Number.NaN, totalPnl: 42.5 },
      params: {
        request: { nested: { score: Number.NaN } },
        configOverride: { slippage: Number.POSITIVE_INFINITY },
        // Non-finite inside the effective config must survive too.
        effectiveConfig: {
          ...EFFECTIVE_CONFIG,
          riskFreeRate: Number.NaN,
        } as unknown as StrategyConfig,
      },
    });

    const built = buildBacktestExport(ctx);
    const round = parseBacktestExport(serializeBacktestExport(built));

    // Non-finite values restored to the exact non-finite number.
    const bars = round.input.bars;
    expect(Number.isNaN(bars[0]!.open)).toBe(true);
    expect(bars[0]!.high).toBe(Number.POSITIVE_INFINITY);
    expect(bars[0]!.low).toBe(Number.NEGATIVE_INFINITY);

    const plot = round.output.series['plot']!;
    expect(plot[1]).toBe(Number.NaN);
    expect(plot[2]).toBe(Number.POSITIVE_INFINITY);
    expect(plot[3]).toBe(Number.NEGATIVE_INFINITY);

    expect(round.output.equityCurve[1]).toBe(Number.NaN);
    expect(round.output.equityCurve[2]).toBe(Number.NEGATIVE_INFINITY);
    expect(round.output.drawdownCurve[2]).toBe(Number.POSITIVE_INFINITY);
    expect(round.output.monthlyReturns['2026-01']).toBe(Number.POSITIVE_INFINITY);
    expect(round.output.buyHoldReturn).toBe(Number.NEGATIVE_INFINITY);
    expect((round.trades[0] as { pnl: number }).pnl).toBe(Number.NaN);
    expect((round.orders[0] as { qty: number }).qty).toBe(Number.POSITIVE_INFINITY);
    expect((round.metrics as { sharpeRatio: number }).sharpeRatio).toBe(Number.NaN);
    expect((round.metrics as { totalPnl: number }).totalPnl).toBe(42.5);
    expect((round.params.effectiveConfig as unknown as { riskFreeRate: number }).riskFreeRate).toBe(
      Number.NaN,
    );

    // Finite values survive EXACTLY — no rounding, no null-ing.
    expect(bars[0]!.close).toBe(123.456789);
    expect(plot[0]).toBe(1.5);
    expect(plot[4]).toBe(0);
    expect(round.output.drawdownCurve[1]).toBe(-5.25);
    expect(round.output.monthlyReturns['2026-02']).toBe(5.5);
  });

  it('serialized JSON uses __nonfinite tags and never emits raw NaN/Infinity', async () => {
    const built = buildBacktestExport(
      makeContext({
        output: {
          series: new Map([
            [
              'plot',
              makeSeries('plot', [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]),
            ],
          ]),
          barTimestamps: [1],
          strategyMarkers: [],
          equityCurve: [Number.NaN],
          drawdownCurve: [],
          equityPoints: [],
          monthlyReturns: {},
          buyHoldReturn: Number.POSITIVE_INFINITY,
        },
      }),
    );

    const raw = serializeBacktestExport(built);

    // Tags are present for each non-finite value.
    expect(raw).toContain('"__nonfinite":"NaN"');
    expect(raw).toContain('"__nonfinite":"Infinity"');
    expect(raw).toContain('"__nonfinite":"-Infinity"');

    // A JSON.parse of the raw string yields NO non-finite numbers anywhere.
    const parsed = JSON.parse(raw);
    assertAllNumbersFinite(parsed);
    expect(parsed.output.equityCurve[0]).toEqual({ __nonfinite: 'NaN' });
    expect(parsed.output.buyHoldReturn).toEqual({ __nonfinite: 'Infinity' });
  });

  it('a fully-finite export round-trips to a deep-equal object', async () => {
    const built = buildBacktestExport(makeContext());
    const round = parseBacktestExport(serializeBacktestExport(built));
    expect(round).toEqual(built);
    expect(round.schemaVersion).toBe(BACKTEST_EXPORT_SCHEMA_VERSION);
  });

  it('preserves a null/na value in a series as JSON null (never coerced to 0)', async () => {
    const ctx = makeContext({
      output: {
        series: new Map<string, Series>([
          ['plot', makeSeries('plot', [103.5, null as unknown as number, 106.5])],
        ]),
        barTimestamps: [1, 2, 3],
        strategyMarkers: [],
        equityCurve: [1],
        drawdownCurve: [],
        equityPoints: [],
        monthlyReturns: {},
        buyHoldReturn: 0,
      },
    });
    const built = buildBacktestExport(ctx);
    expect(built.output.series['plot']![1]).toBeNull();
    const raw = serializeBacktestExport(built);
    expect(raw).toContain('null');
    const round = parseBacktestExport(raw);
    expect(round.output.series['plot']![1]).toBeNull();
  });

  it('copies engine-owned arrays — mutating inputs after build does not alias the export', async () => {
    const seriesValues = [1, 2, 3];
    const barTimestamps = [100, 200, 300];
    const equityCurve = [1000, 1100, 1200];
    const built = buildBacktestExport(
      makeContext({
        output: {
          series: new Map([['plot', makeSeries('plot', seriesValues)]]),
          barTimestamps,
          strategyMarkers: [],
          equityCurve,
          drawdownCurve: [],
          equityPoints: [],
          monthlyReturns: {},
          buyHoldReturn: 1,
        },
      }),
    );

    // Mutate the engine-owned arrays after the build.
    seriesValues.push(4);
    seriesValues[0] = 999;
    barTimestamps.push(400);
    equityCurve[0] = 0;

    expect(built.output.series['plot']).toEqual([1, 2, 3]);
    expect(built.output.barTimestamps).toEqual([100, 200, 300]);
    expect(built.output.equityCurve).toEqual([1000, 1100, 1200]);
  });
});

// ── EffectiveConfig guard (D3) ──────────────────────────────────────────────

describe('backtest-export lib — effectiveConfig guard', () => {
  it('THROWS when params.effectiveConfig is unavailable', async () => {
    const ctx = makeContext();
    (ctx.params as { effectiveConfig?: unknown }).effectiveConfig = undefined;
    expect(() => buildBacktestExport(ctx)).toThrow(/effectiveConfig is required/);
  });

  it('THROWS when params.effectiveConfig is null', async () => {
    const ctx = makeContext();
    (ctx.params as { effectiveConfig?: unknown }).effectiveConfig = null;
    expect(() => buildBacktestExport(ctx)).toThrow(/effectiveConfig/);
  });

  it('carries the effective config through the round-trip unchanged', async () => {
    const built = buildBacktestExport(makeContext());
    expect(built.params.effectiveConfig).toEqual(EFFECTIVE_CONFIG);
    const round = parseBacktestExport(serializeBacktestExport(built));
    expect(round.params.effectiveConfig).toEqual(EFFECTIVE_CONFIG);
  });
});

// ── Meta / fingerprint defaults ─────────────────────────────────────────────

describe('backtest-export lib — meta and fingerprint defaults', () => {
  it('barCount defaults to bars.length when omitted; explicit startDate/endDate are included', async () => {
    const built = buildBacktestExport(
      makeContext({
        meta: { symbol: 'BTCUSDT', timeframe: '60', engineVersion: '0.1.0', scriptHash: 'x' },
      }),
    );
    expect(built.meta.barCount).toBe(3);
    expect(built.meta.startDate).toBeUndefined();
    expect(built.meta.endDate).toBeUndefined();

    const scoped = buildBacktestExport(
      makeContext({
        meta: {
          symbol: 'BTCUSDT',
          timeframe: '60',
          startDate: 1_700_000_000_000,
          endDate: 1_700_007_200_000,
          engineVersion: '0.1.0',
          scriptHash: 'x',
        },
      }),
    );
    expect(scoped.meta.startDate).toBe(1_700_000_000_000);
    expect(scoped.meta.endDate).toBe(1_700_007_200_000);
  });

  it('uses a precomputed fingerprint when provided', async () => {
    const built = buildBacktestExport(
      makeContext({ input: { bars: makeBars(), fingerprint: 'deadbeef' } }),
    );
    expect(built.input.fingerprint).toBe('deadbeef');
  });
});

// ── computeInputFingerprint (D4) ────────────────────────────────────────────

describe('backtest-export lib — computeInputFingerprint', () => {
  const bars: BacktestExportContext['input']['bars'] = makeBars();

  it('is deterministic for identical bars', async () => {
    expect(computeInputFingerprint(bars)).toBe(computeInputFingerprint(makeBars()));
  });

  it('changes when a bar value changes (input drift detection)', async () => {
    const drifted = makeBars();
    drifted[1] = { ...drifted[1]!, close: drifted[1]!.close + 0.01 };
    expect(computeInputFingerprint(drifted)).not.toBe(computeInputFingerprint(makeBars()));
  });

  it('changes when a bar is added or removed', async () => {
    const fewer = makeBars().slice(0, 2);
    expect(computeInputFingerprint(fewer)).not.toBe(computeInputFingerprint(makeBars()));
  });

  it('emits a 64-hex-character lowercase string (sha256 per design D2)', async () => {
    expect(computeInputFingerprint(bars)).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── scriptHash (D4) ─────────────────────────────────────────────────────────

describe('backtest-export lib — scriptHash (dependency-free SHA-256)', () => {
  it('matches the NIST FIPS 180-4 vector for the empty string', async () => {
    expect(scriptHash('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('matches the NIST FIPS 180-4 vector for "abc"', async () => {
    expect(scriptHash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('matches node:crypto for multi-block input (block chaining)', async () => {
    const input = 'x'.repeat(1000);
    const expected = createHash('sha256').update(input, 'utf-8').digest('hex');
    expect(scriptHash(input)).toBe(expected);
  });

  it('matches node:crypto for a realistic Pine Script body', async () => {
    const script = '//@version=5\nstrategy("EMA Cross", overlay=true, initial_capital=10000)\n';
    const expected = createHash('sha256').update(script, 'utf-8').digest('hex');
    expect(scriptHash(script)).toBe(expected);
  });
});

// ── exportFilename (D4) ─────────────────────────────────────────────────────

describe('backtest-export lib — exportFilename', () => {
  it('formats backtest-<source>-<symbol>-<runId>-<ISO-timestamp>.json', async () => {
    const ts = new Date('2026-08-14T12:00:00.000Z').getTime();
    expect(exportFilename('script', 'BTCUSDT', 'run-1', ts)).toBe(
      'backtest-script-BTCUSDT-run-1-2026-08-14T12-00-00-000Z.json',
    );
  });

  it('replaces ":" and "." in the ISO timestamp with "-" so the name is filesystem-safe', async () => {
    const name = exportFilename(
      'frontend',
      'ETHUSDT',
      'run-2',
      new Date('2026-01-02T03:04:05.006Z').getTime(),
    );
    expect(name).toBe('backtest-frontend-ETHUSDT-run-2-2026-01-02T03-04-05-006Z.json');
    // The timestamp portion (before the .json extension) contains no ':' or '.'.
    const timestampPart = name.slice('backtest-frontend-ETHUSDT-'.length, -'.json'.length);
    expect(timestampPart).not.toMatch(/[.:]/);
    // Only the extension dot remains.
    expect(name).toContain('.json');
  });

  it('embeds the runId and the ISO timestamp — its parts reconstruct the original ms', async () => {
    const ts = new Date('2024-12-31T23:59:59.999Z').getTime();
    const name = exportFilename('script', 'SOLUSDT', 'run-9', ts);
    // The runId may itself contain hyphens (CLI/frontend runIds are UUIDs), so
    // capture it greedily up to the anchored ISO timestamp part.
    const match = name.match(
      /^backtest-script-SOLUSDT-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/,
    );
    expect(match).toBeTruthy();
    expect(match![1]).toBe('run-9'); // runId sits between symbol and timestamp
    const [datePart, timeParts] = match![2]!.split('T');
    const [h, m, s, ms] = timeParts!.replace(/Z$/, '').split('-');
    const rebuilt = `${datePart}T${h}:${m}:${s}.${ms}Z`;
    expect(new Date(rebuilt).getTime()).toBe(ts);
  });
});

// ── Schema constants ────────────────────────────────────────────────────────

describe('backtest-export lib — schema contract', async () => {
  it('freezes the schema version at 2', async () => {
    expect(BACKTEST_EXPORT_SCHEMA_VERSION).toBe(2);
  });

  it('the builder returns a full BacktestExport shape', async () => {
    const built: BacktestExport = buildBacktestExport(makeContext());
    expect(built.schemaVersion).toBe(2);
    expect(built.timestampUnit).toBe('ms'); // D3: documents self-describe their timestamp unit
    expect(built.source).toBe('script');
    expect(built.generatedAt).toBe('2026-08-14T12:00:00.000Z');
    expect(built.runId).toBe('run-1');
    expect(built.input.bars).toHaveLength(3);
    expect(built.output.series).toHaveProperty('close');
    expect(built.output.series).toHaveProperty('ema');
    expect(built.warnings).toEqual([{ type: 'export-failure', message: 'na values present' }]);
  });
});

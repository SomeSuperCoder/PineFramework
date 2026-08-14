/**
 * backtest-export.ts — shared "backtest full data export" contract (OpenSpec
 * backtest-full-data-export, design.md D1-D4).
 *
 * FRONTEND-SAFE BY DESIGN: NO node: imports, no fs, no Buffer, no crypto.
 * Everything here is plain data + pure functions, so this module runs unchanged
 * in the browser and in the Node backend. All file I/O lives in the backend
 * glue (backend/src/backtest-export.ts) — never here.
 *
 * FIDELITY PROMISE: the export is a lossless snapshot of a completed backtest.
 *   - metrics / trades / orders are stored RAW — no sanitization, no rounding.
 *   - serializeBacktestExport / parseBacktestExport round-trip NaN and ±Infinity
 *     through tagged placeholders, because JSON.stringify would lossily coerce
 *     them to null.
 *
 * TIMESTAMP UNIT: every timestamp in the schema (meta.startDate/endDate,
 * input.bars[].timestamp, output.barTimestamps, output equityPoints times) is
 * an epoch millisecond (ms). See BACKTEST_EXPORT_TIMESTAMP_UNIT.
 */

import type { Bar } from '../data/bar.js';
import type { Series } from '../language/runtime/series.js';
import type { StrategyConfig } from '../strategy/strategy-engine.js';
// Design D4: the export's warnings are the run's TYPED diagnostics (WarningCollector),
// not strings — the export document and the API result payload share the same array.
import type { BacktestWarning } from '../warning-collector.js';

/**
 * Frozen schema revision. Bump only when the shape breaks (then migrate).
 * v1 → v2 (reviewer F4): `warnings` changed from string[] to BacktestWarning[]
 * (typed diagnostics, design D4) — an object shape v1 consumers cannot parse,
 * so the revision MUST bump. The writer always emits the version
 * (buildBacktestExport.schemaVersion), so consumers can gate on it.
 */
export const BACKTEST_EXPORT_SCHEMA_VERSION = 2 as const;

/** All timestamps in the export are epoch milliseconds (ms). */
export const BACKTEST_EXPORT_TIMESTAMP_UNIT = 'ms' as const;

export type BacktestExportSource = 'script' | 'frontend';

export interface BacktestExportMeta {
  symbol: string;
  timeframe: string;
  /** Epoch ms, present when the run was date-scoped. */
  startDate?: number;
  /** Epoch ms, present when the run was date-scoped. */
  endDate?: number;
  barCount: number;
  engineVersion: string;
  /** sha256 hex of the Pine Script source (scriptHash). */
  scriptHash: string;
}

export interface BacktestExportParams {
  /** Raw CLI options (script side) / HTTP job config (frontend side). */
  request: Record<string, unknown>;
  /** The config override applied on top of the script's strategy() declaration. */
  configOverride: Record<string, unknown>;
  /** Full effective engine config — REQUIRED, from engine.getStrategyEngine().getConfig(). */
  effectiveConfig: StrategyConfig;
}

export interface ExportBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BacktestExportInput {
  bars: ExportBar[];
  /** sha256 over the serialized bars (design D2) — detects input drift vs. the original dataset. */
  fingerprint: string;
}

export interface BacktestExportOutput {
  /** Columnar plot series: plot name → per-bar values (na serializes as JSON null). */
  series: Record<string, number[]>;
  barTimestamps: number[];
  strategyMarkers: unknown[];
  equityCurve: number[];
  drawdownCurve: number[];
  equityPoints: unknown[];
  monthlyReturns: Record<string, number>;
  buyHoldReturn: number;
}

/**
 * Full backtest data export. All values are RAW (no sanitization, no rounding);
 * non-finite numbers survive serialization through tagged placeholders.
 */
export interface BacktestExport {
  schemaVersion: 2;
  /** Declares the unit of every timestamp in the document — self-describing (D3). */
  timestampUnit: typeof BACKTEST_EXPORT_TIMESTAMP_UNIT;
  source: BacktestExportSource;
  /** ISO-8601 UTC when the export was generated. */
  generatedAt: string;
  /** CLI run id (CLI) or jobId (frontend/HTTP). */
  runId: string;
  meta: BacktestExportMeta;
  params: BacktestExportParams;
  input: BacktestExportInput;
  output: BacktestExportOutput;
  /** Full raw Trade objects. */
  trades: unknown[];
  /** Full raw FilledOrder objects. */
  orders: unknown[];
  /** RAW StrategyMetrics — deliberately unsanitized. */
  metrics: unknown;
  /** Typed per-run diagnostics (design D4) — the WarningCollector's array. */
  warnings: BacktestWarning[];
}

/** Plain-data context consumed by the pure builder. */
export interface BacktestExportContext {
  runId: string;
  source: BacktestExportSource;
  /** Defaults to now (ISO-8601 UTC) when omitted. */
  generatedAt?: string;
  meta: {
    symbol: string;
    timeframe: string;
    startDate?: number;
    endDate?: number;
    barCount?: number;
    engineVersion: string;
    scriptHash: string;
  };
  params: {
    request: Record<string, unknown>;
    configOverride: Record<string, unknown>;
    /** REQUIRED — build FAILS when unavailable (contract: effectiveConfig). */
    effectiveConfig: StrategyConfig;
  };
  input: {
    bars: Bar[];
    /** Precomputed fingerprint; computed from bars when omitted. */
    fingerprint?: string;
  };
  output: {
    /** Engine plot outputs (engine.getAllOutputs()) — converted to columnar arrays. */
    series: Map<string, Series>;
    barTimestamps: number[];
    strategyMarkers: unknown[];
    equityCurve: number[];
    drawdownCurve: number[];
    equityPoints: unknown[];
    monthlyReturns: Record<string, number>;
    buyHoldReturn: number;
  };
  trades: unknown[];
  orders: unknown[];
  metrics: unknown;
  /** Typed per-run diagnostics (design D4) — defaults to [] when omitted. */
  warnings?: BacktestWarning[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Fidelity-preserving serialization (D2)
// ─────────────────────────────────────────────────────────────────────────────

/** Tagged placeholder emitted in place of a non-finite number. */
type NonFiniteTag = { __nonfinite: 'NaN' | 'Infinity' | '-Infinity' };

const NON_FINITE_KEY = '__nonfinite';

function toTag(value: number): NonFiniteTag | null {
  if (Number.isNaN(value)) return { __nonfinite: 'NaN' };
  if (value === Infinity) return { __nonfinite: 'Infinity' };
  if (value === -Infinity) return { __nonfinite: '-Infinity' };
  return null;
}

/** Recursively replace non-finite numbers with tags. Returns a NEW tree (no mutation). */
function replaceNonFinite(value: unknown): unknown {
  if (typeof value === 'number') {
    return toTag(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceNonFinite(item));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = replaceNonFinite(item);
    }
    return out;
  }
  return value;
}

function isNonFiniteTag(value: unknown): value is NonFiniteTag {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as NonFiniteTag)[NON_FINITE_KEY] !== undefined
  );
}

/** Recursively restore tagged placeholders back to NaN / ±Infinity. */
function restoreNonFinite(value: unknown): unknown {
  if (isNonFiniteTag(value)) {
    const raw = (value as NonFiniteTag)[NON_FINITE_KEY];
    if (raw === 'NaN') return NaN;
    if (raw === 'Infinity') return Infinity;
    if (raw === '-Infinity') return -Infinity;
    // Unknown tag payload — defensive passthrough (schema is frozen).
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => restoreNonFinite(item));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = restoreNonFinite(item);
    }
    return out;
  }
  return value;
}

/** Serialize with NaN/±Infinity preserved via tagged placeholders (NOT JSON's lossy null). */
export function serializeBacktestExport(obj: BacktestExport): string {
  return JSON.stringify(replaceNonFinite(obj));
}

/** Inverse of serializeBacktestExport — restores NaN/±Infinity. */
export function parseBacktestExport(json: string): BacktestExport {
  return restoreNonFinite(JSON.parse(json)) as BacktestExport;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure builder (D3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a BacktestExport from a plain context object. Pure: same context in,
 * same export out (except generatedAt when omitted). Throws when
 * ctx.params.effectiveConfig is unavailable — the effective config is a
 * REQUIRED part of the contract and a build must fail rather than ship a
 * partial export.
 */
export function buildBacktestExport(ctx: BacktestExportContext): BacktestExport {
  if (!ctx.params.effectiveConfig) {
    throw new Error(
      'buildBacktestExport: params.effectiveConfig is required ' +
        '(from engine.getStrategyEngine().getConfig())',
    );
  }

  const bars: ExportBar[] = ctx.input.bars.map((b) => ({
    timestamp: b.timestamp,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));

  // Columnar conversion: Map<string, Series> → Record<plot, values[]>.
  // Values are COPIED (spread) so the export never aliases the engine's internal
  // arrays after the backtest finishes. s.values is PineValue[] (may hold null/na
  // for missing plots); the schema types plots as number[] per the frozen
  // contract, and na values still serialize as JSON null. The cast is
  // type-level only — no value is altered.
  const series: Record<string, number[]> = {};
  for (const [name, s] of ctx.output.series) {
    series[name] = [...s.values] as number[];
  }

  return {
    schemaVersion: BACKTEST_EXPORT_SCHEMA_VERSION,
    timestampUnit: BACKTEST_EXPORT_TIMESTAMP_UNIT,
    source: ctx.source,
    generatedAt: ctx.generatedAt ?? new Date().toISOString(),
    runId: ctx.runId,
    meta: {
      symbol: ctx.meta.symbol,
      timeframe: ctx.meta.timeframe,
      ...(ctx.meta.startDate !== undefined ? { startDate: ctx.meta.startDate } : {}),
      ...(ctx.meta.endDate !== undefined ? { endDate: ctx.meta.endDate } : {}),
      barCount: ctx.meta.barCount ?? bars.length,
      engineVersion: ctx.meta.engineVersion,
      scriptHash: ctx.meta.scriptHash,
    },
    params: {
      request: { ...ctx.params.request },
      configOverride: { ...ctx.params.configOverride },
      effectiveConfig: ctx.params.effectiveConfig,
    },
    input: {
      bars,
      fingerprint: ctx.input.fingerprint ?? computeInputFingerprint(bars),
    },
    output: {
      series,
      barTimestamps: [...ctx.output.barTimestamps],
      strategyMarkers: [...ctx.output.strategyMarkers],
      equityCurve: [...ctx.output.equityCurve],
      drawdownCurve: [...ctx.output.drawdownCurve],
      equityPoints: [...ctx.output.equityPoints],
      monthlyReturns: { ...ctx.output.monthlyReturns },
      buyHoldReturn: ctx.output.buyHoldReturn,
    },
    trades: [...ctx.trades],
    orders: [...ctx.orders],
    metrics: ctx.metrics,
    warnings: [...(ctx.warnings ?? [])],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (D4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Export file name: `backtest-<source>-<symbol>-<runId>-<ISO-timestamp>.json`
 * e.g. backtest-script-BTCUSDT-run-1-2026-08-14T12-00-00-000Z.json.
 * runId disambiguates same-symbol exports generated in the same millisecond
 * (a bare source+symbol+ms collides). ':' and '.' are replaced with '-' so the
 * name is filesystem-safe on Windows.
 */
export function exportFilename(
  source: BacktestExportSource,
  symbol: string,
  runId: string,
  timestampMs: number,
): string {
  const iso = new Date(timestampMs).toISOString().replace(/[:.]/g, '-');
  return `backtest-${source}-${symbol}-${runId}-${iso}.json`;
}

/**
 * sha256 hex over the JSON of the bars (design D2: "sha256 over the serialized
 * bars"). Reuses the module's own dependency-free scriptHash (TextEncoder, no
 * node:crypto) so it stays browser-safe. Purpose: detect input drift between
 * the export and the original dataset.
 */
export function computeInputFingerprint(bars: ExportBar[]): string {
  return scriptHash(JSON.stringify(bars));
}

// ─────────────────────────────────────────────────────────────────────────────
// Dependency-free SHA-256 (FIPS 180-4) — used for scriptHash
// ─────────────────────────────────────────────────────────────────────────────

/** First 32 bits of the fractional parts of the cube roots of the first 64 primes. */
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function sha256Rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/**
 * sha256 hex digest of a string — dependency-free (TextEncoder is available in
 * both browsers and Node). The backend glue MAY swap in node:crypto for
 * throughput; the digest is identical. This is the lib default so the frontend
 * computes the same scriptHash without shipping crypto code.
 */
export function scriptHash(script: string): string {
  const bytes = new TextEncoder().encode(script);
  const bitLength = bytes.length * 8;

  // Pad: 0x80 byte, zero-fill to block boundary, then 64-bit big-endian bit length.
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);

  // Initial hash values (FIPS 180-4 §5.3.3).
  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const w = new Uint32Array(64);

  for (let block = 0; block < padded.length; block += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = view.getUint32(block + t * 4);
    }
    for (let t = 16; t < 64; t++) {
      const s0 = sha256Rotr(w[t - 15]!, 7) ^ sha256Rotr(w[t - 15]!, 18) ^ (w[t - 15]! >>> 3);
      const s1 = sha256Rotr(w[t - 2]!, 17) ^ sha256Rotr(w[t - 2]!, 19) ^ (w[t - 2]! >>> 10);
      w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) >>> 0;
    }

    let a = h[0]!,
      b = h[1]!,
      c = h[2]!,
      d = h[3]!;
    let e = h[4]!,
      f = h[5]!,
      g = h[6]!,
      hh = h[7]!;

    for (let t = 0; t < 64; t++) {
      const bigS1 = sha256Rotr(e, 6) ^ sha256Rotr(e, 11) ^ sha256Rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + bigS1 + ch + SHA256_K[t]! + w[t]!) >>> 0;
      const bigS0 = sha256Rotr(a, 2) ^ sha256Rotr(a, 13) ^ sha256Rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (bigS0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }

  return h.map((x) => x.toString(16).padStart(8, '0')).join('');
}

/**
 * FLOATING-POINT FINAL GATE — the acceptance gate for the decimal-safe migration.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The current engine performs arithmetic in IEEE-754 doubles, so decimal-exact
 * results (0.1 + 0.2 = 0.3) come out as binary artifacts (0.30000000000000004).
 * The decimal-safe migration (M3–M12) replaces internal arithmetic with exact
 * decimal semantics. This gate is the objective proof that the migration worked:
 *
 *   🔴 TODAY (float engine):   this test MUST FAIL on FP-artifact assertions —
 *      e.g. "expected 0.3, received 0.30000000000000004".
 *   🟢 AFTER migration:        the SAME assertions must PASS, because exact
 *      decimal 0.3 converts back to the nearest double, which IS 0.3.
 *
 * If this test fails for ANY reason other than an FP-artifact assertion
 * (syntax error, missing builtin, engine crash, missing output key), the gate
 * is broken — fix the TEST, never the engine.
 *
 * LANE: this file is owned by the Test Engineer. It must never be edited to
 * make the engine pass; it flips GREEN when the decimal migration lands.
 */
import { parse } from '../../src/language/parser/index.js';
import { compile } from '../../src/language/compiler/index.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import type { Bar } from '../../src/data/bar.js';
import { Decimal } from 'decimal.js';

/**
 * The gate program: plots KNOWN-EXACT decimal results. Terminating decimals are
 * exact in decimal arithmetic but NOT in binary floating point — so every trap
 * below is a landmine the float engine steps on, and a no-op for the decimal
 * engine. Only constructs the current engine supports (verified against
 * test_indicators/supertrend-3d.pine and the runtime builtins).
 */
const SOURCE = `//@version=5
indicator("FP Final Gate", overlay=true)

// ── Decimal-exact traps (terminating decimals — exact in decimal.js, NOT in float) ──
plot(0.1 + 0.2, "trap_add")        // expect exactly 0.3
plot(0.3 - 0.1, "trap_sub")        // expect exactly 0.2
plot(0.1 * 3, "trap_mul")          // expect exactly 0.3
plot(0.1 * 0.2, "trap_mul2")       // expect exactly 0.02
plot(1 / 2, "trap_div2")           // expect exactly 0.5
plot(1 / 4, "trap_div4")           // expect exactly 0.25
plot(1 / 8, "trap_div8")           // expect exactly 0.125
plot(0.1 + 0.2 + 0.7, "trap_sum3") // expect exactly 1.0
plot(0.1 * 10, "trap_scale")       // expect exactly 1.0

// ── Accumulation trap: 0.1 added per bar; final must be barCount * 0.1 EXACTLY ──
var float acc = 0.0
acc := acc + 0.1
plot(acc, "trap_accumulate")       // final bar = 120 * 0.1 = 12.0 exactly (float drifts to 12.000000000000002)

// ── Round-trip traps using close (every bar) ──
plot(close * 2 - close, "trap_rt")   // expect close exactly each bar
plot((close / 2) * 2, "trap_rt2")    // expect close exactly each bar

// ── SMA trap: SMA of a constant 0.1 series must be exactly 0.1 ──
plot(ta.sma(close * 0 + 0.1, 10), "trap_sma") // expect exactly 0.1 after warmup

// ── Comparison trap: 0.1+0.2 == 0.3 must be TRUE ──
plot((0.1 + 0.2) == 0.3 ? 1 : 0, "trap_cmp")  // expect 1 on every bar
`;

const BAR_COUNT = 120;

/** Traps that must stringify SHORT (no 12+ digit fraction). */
const DECIMAL_EXACT_TRAPS = [
  'trap_add',
  'trap_sub',
  'trap_mul',
  'trap_mul2',
  'trap_div2',
  'trap_div4',
  'trap_div8',
  'trap_sum3',
  'trap_scale',
  'trap_accumulate',
  'trap_sma',
  'trap_cmp',
] as const;

/** Output keys carry metadata suffixes (e.g. `trap_add__style:line`). */
const TRAP_KEYS = [...DECIMAL_EXACT_TRAPS, 'trap_rt', 'trap_rt2'] as const;

// ── Standard project harness (same shape as supertrend-3d.test.ts) ──

function createBars(count: number, startPrice: number = 100): Bar[] {
  const bars: Bar[] = [];
  let price = startPrice;
  let s = 42;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < count; i++) {
    const open = price;
    const change = (rand() - 0.5) * 4;
    const close = open + change;
    const high = Math.max(open, close) + rand() * 2;
    const low = Math.min(open, close) - rand() * 2;
    bars.push({
      timestamp: 1700000000000 + i * 3600000,
      open,
      high,
      low,
      close,
      volume: Math.floor(rand() * 10000) + 1000,
    });
    price = close;
  }
  return bars;
}

function barsToContext(bars: Bar[]): ExecutionContext[] {
  return bars.map((bar, index) => ({
    barIndex: index,
    barCount: bars.length,
    timestamp: bar.timestamp,
    open: createSeries('open', [bar.open]),
    high: createSeries('high', [bar.high]),
    low: createSeries('low', [bar.low]),
    close: createSeries('close', [bar.close]),
    volume: createSeries('volume', [bar.volume]),
  }));
}

function execute(source: string, barCount = BAR_COUNT) {
  const { ast } = parse(source);
  const compileResult = compile(ast);
  const engine = new ExecutionEngine(compileResult);
  const bars = createBars(barCount);
  const contexts = barsToContext(bars);
  return {
    ast,
    compileResult,
    engine,
    bars,
    result: engine.executeBars(contexts),
  };
}

/** Find the plot output series for a trap by its key fragment. */
function trapSeries(result: ReturnType<typeof execute>['result'], trap: string) {
  const key = Array.from(result.outputs.keys()).find((k) => k.includes(trap));
  expect(key).toBeDefined();
  return Array.from(result.outputs.get(key!)!.values);
}

describe('FP Final Gate — floating-point artifact detector (decimal-safe migration acceptance)', () => {
  // ── 3. Positive control: the gate is ALIVE ────────────────────────────────
  // Belt-and-suspenders: proves the program parses, compiles, executes and
  // registers every trap key. If a future rename silently breaks the harness,
  // this test fails — the gate can never vacuously pass.
  describe('gate is alive (positive control)', () => {
    it('parses, compiles and executes end-to-end with no engine error', () => {
      const { ast, result } = execute(SOURCE);
      expect(ast).toBeDefined();
      expect(ast.scriptKind).toBe('indicator');
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('registers every trap output key', () => {
      const { result } = execute(SOURCE);
      expect(result.success).toBe(true);
      const keys = Array.from(result.outputs.keys());
      for (const trap of TRAP_KEYS) {
        expect(keys.some((k) => k.includes(trap))).toBe(true);
      }
      expect(keys.length).toBeGreaterThanOrEqual(TRAP_KEYS.length);
    });
  });

  // ── 1. Exact-equality table ───────────────────────────────────────────────
  // Expected values are computed with decimal.js (exact decimal → nearest double),
  // so the gate is self-validating against exact decimals, not float literals.
  describe('decimal-exact traps (float engine produces IEEE artifacts)', () => {
    it.each([
      ['trap_add', '0.3'],
      ['trap_sub', '0.2'],
      ['trap_mul', '0.3'],
      ['trap_mul2', '0.02'],
      ['trap_div2', '0.5'],
      ['trap_div4', '0.25'],
      ['trap_div8', '0.125'],
      ['trap_sum3', '1'],
      ['trap_scale', '1'],
    ] as const)('%s: last bar === exact decimal %s', (trap, expectedDecimal) => {
      const { result } = execute(SOURCE);
      expect(result.success).toBe(true);
      const values = trapSeries(result, trap);
      const last = values[values.length - 1] as number;
      expect(last).toBe(new Decimal(expectedDecimal).toNumber());
    });

    it('trap_accumulate: last bar === barCount * 0.1 exactly (120 → 12)', () => {
      const { result } = execute(SOURCE);
      expect(result.success).toBe(true);
      const values = trapSeries(result, 'trap_accumulate');
      const last = values[values.length - 1] as number;
      expect(last).toBe(new Decimal(BAR_COUNT).times('0.1').toNumber());
    });

    it('trap_rt: close * 2 - close === close on every post-warmup bar', () => {
      const { result, bars } = execute(SOURCE);
      expect(result.success).toBe(true);
      const values = trapSeries(result, 'trap_rt');
      expect(values.length).toBe(bars.length);
      // The script's max lookback is 10 (ta.sma(..., 10)), so the engine
      // nulls the first 10 bars of ALL outputs (documented warmup behavior,
      // same as supertrend-3d). Only post-warmup bars are FP-relevant.
      let compared = 0;
      for (let i = 0; i < bars.length; i++) {
        if (values[i] === null || values[i] === undefined) continue; // warmup null
        compared++;
        expect(values[i]).toBe(bars[i]!.close);
      }
      // Every post-lookback bar must carry a value — nothing silently dropped.
      expect(compared).toBeGreaterThanOrEqual(bars.length - 10);
    });

    it('trap_rt2: (close / 2) * 2 === close on every post-warmup bar', () => {
      const { result, bars } = execute(SOURCE);
      expect(result.success).toBe(true);
      const values = trapSeries(result, 'trap_rt2');
      expect(values.length).toBe(bars.length);
      let compared = 0;
      for (let i = 0; i < bars.length; i++) {
        if (values[i] === null || values[i] === undefined) continue; // warmup null
        compared++;
        expect(values[i]).toBe(bars[i]!.close);
      }
      expect(compared).toBeGreaterThanOrEqual(bars.length - 10);
    });

    it('trap_sma: SMA(0.1, 10) === exactly 0.1 on every bar after warmup', () => {
      const { result } = execute(SOURCE);
      expect(result.success).toBe(true);
      const values = trapSeries(result, 'trap_sma');
      // SMA(10) warms up after 10 bars; assert every post-warmup value.
      for (let i = 10; i < values.length; i++) {
        expect(values[i]).toBe(new Decimal('0.1').toNumber());
      }
    });

    it('trap_cmp: (0.1 + 0.2) == 0.3 is TRUE on every bar (last 50)', () => {
      const { result } = execute(SOURCE);
      expect(result.success).toBe(true);
      const values = trapSeries(result, 'trap_cmp');
      const tail = values.slice(Math.max(0, values.length - 50));
      for (const v of tail) {
        expect(v).toBe(1);
      }
    });
  });

  // ── 2. Global artifact sweep ──────────────────────────────────────────────
  // Every numeric value in a decimal-exact trap must stringify SHORT. IEEE
  // artifacts have 12+ fraction digits (0.30000000000000004, 12.000000000000002,
  // 0.09999999999999999) — legit decimal-exact results never do.
  // trap_rt / trap_rt2 are deliberately excluded: they carry arbitrary close
  // values (covered by exact per-bar assertions above) whose long fraction
  // strings are legitimate input data, not artifacts.
  describe('global artifact sweep', () => {
    it('no decimal-exact output value stringifies to an IEEE artifact', () => {
      const { result } = execute(SOURCE);
      expect(result.success).toBe(true);
      for (const trap of DECIMAL_EXACT_TRAPS) {
        const values = trapSeries(result, trap);
        for (const v of values) {
          if (typeof v !== 'number') continue; // null before warmup / NA
          const s = String(v);
          expect(s).not.toMatch(/\d+\.\d{12,}\d+/);
        }
      }
    });
  });
});

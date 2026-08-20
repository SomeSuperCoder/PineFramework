/**
 * M5a.1 FORMING-CANDLE REALTIME SMOKE — DecimalRingBuffer rebuild lock.
 *
 * Locks the M5a.1 fix in forming-candle.ts: the pre-tick smaBuffers snapshot now
 * carries a `kind` tag, and the restore rebuilds the buffer as its ORIGINAL
 * class (DecimalRingBuffer.fromArray when decimal) instead of always rebuilding
 * a float RingBuffer.
 *
 * THE TWO OLD BUGS THIS SUITE WOULD CATCH:
 *   1. `[...v]` spread on a DecimalRingBuffer (no Symbol.iterator) threw
 *      TypeError: DecimalRingBuffer is not iterable on the FIRST forming-candle
 *      tick after ta.sma created decimal state.
 *   2. The restore always rebuilt `RingBuffer.fromArray(number[])`. The next
 *      tick's ta.sma would push a Decimal into a number-typed buffer —
 *      `this.sum += value` coerces the Decimal → corrupted running sum → the
 *      second consecutive tick's sma value would be wrong (NaN/garbage).
 *
 * The script plots ta.sma(close, 5) — a real DecimalRingBuffer in engine state.
 * Confirmed bars are a constant 0.1 close series (sma5 = 0.1 exactly). Each
 * forming-candle tick feeds a DIFFERENT close (0.2, 0.3, 0.4); the tick's
 * executeBar pushes it into the buffer on top of the restored snapshot, so the
 * expected sma values are EXACT decimals:
 *   tick close=0.2 → window [0.1,0.1,0.1,0.1,0.2] → 0.6/5 = 0.12 EXACTLY
 *   tick close=0.3 → window [0.1,0.1,0.1,0.1,0.3] → 0.7/5 = 0.14 EXACTLY
 *   tick close=0.4 → window [0.1,0.1,0.1,0.1,0.4] → 0.8/5 = 0.16 EXACTLY
 * (float would give 0.12000000000000002 etc. — the gate trap at script level).
 *
 * Consecutive ticks asserting correct values proves the post-tick rebuild
 * produces WORKING subsequent ticks: a Decimal pushed into a rebuilt float
 * buffer would corrupt the running sum on tick 2.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import { DecimalRingBuffer } from '../../src/language/runtime/decimal-ring-buffer.js';
import { configureDecimal } from '../../src/language/runtime/numbers/decimal-config.js';
import { Decimal } from 'decimal.js';

configureDecimal();

// ---------------------------------------------------------------------------
// Minimal harness — synthetic constant bars + forming-candle tick contexts
// ---------------------------------------------------------------------------

const SOURCE = `//@version=6
indicator("FC SMA Smoke", overlay=true)
plot(ta.sma(close, 5), "sma5")
`;

const BAR_COUNT = 30;
const CONST_CLOSE = 0.1; // constant series → sma5 = 0.1 exactly after warmup

function buildContexts(count: number): ExecutionContext[] {
  const bars = Array.from({ length: count }, (_, i) => ({
    timestamp: 1700000000000 + i * 3600000,
    open: CONST_CLOSE,
    high: CONST_CLOSE,
    low: CONST_CLOSE,
    close: CONST_CLOSE,
    volume: 1000,
  }));
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

function makeTickContext(timestamp: number, close: number): ExecutionContext {
  return {
    barIndex: -1, // forming-candle tick has no real bar index
    barCount: 0,
    timestamp,
    open: createSeries('open', [close]),
    high: createSeries('high', [close]),
    low: createSeries('low', [close]),
    close: createSeries('close', [close]),
    volume: createSeries('volume', [1000]),
  };
}

/** Find the output key fragment for the sma5 plot (keys carry metadata suffixes). */
function sma5Diff(result: { diffOutputs: Record<string, unknown> }): number | null {
  const key = Object.keys(result.diffOutputs).find((k) => k.includes('sma5'));
  if (!key) return null;
  const v = result.diffOutputs[key];
  return typeof v === 'number' ? v : null;
}

async function runConfirmed(engine: ExecutionEngine): Promise<void> {
  const result = await engine.executeBars(buildContexts(BAR_COUNT));
  expect(result.success).toBe(true);
}

describe('M5a.1 forming-candle realtime smoke — DecimalRingBuffer rebuild (fp-final-gate lock)', () => {
  it('no throw on forming-candle ticks + exact decimal sma values (0.12, 0.14, 0.16)', async () => {
    const { ast } = parse(SOURCE);
    const engine = new ExecutionEngine(compile(ast));
    await runConfirmed(engine);

    // Sanity: confirmed-bar path produces sma5 = 0.1 EXACTLY (post-warmup).
    // (This is the "same values as the confirmed-bar path" anchor.)
    const outputs = engine.getAllOutputs();
    const smaKey = Array.from(outputs.keys()).find((k) => k.includes('sma5'));
    expect(smaKey).toBeDefined();
    const confirmedValues = outputs.get(smaKey!)!.values;
    const postWarmup = confirmedValues.slice(5); // lookback nulls the first 5 bars
    for (const v of postWarmup) {
      expect(v).toBe(new Decimal('0.1').toNumber());
    }

    // Ticks: each pushes a different close onto the restored snapshot.
    const ticks: Array<{ close: number; expected: string }> = [
      { close: 0.2, expected: '0.12' },
      { close: 0.3, expected: '0.14' },
      { close: 0.4, expected: '0.16' },
    ];

    for (let i = 0; i < ticks.length; i++) {
      const { close, expected } = ticks[i]!;
      const tickCtx = makeTickContext(1700000000000 + BAR_COUNT * 3600000, close);
      engine.setFormingCandle(true);
      // OLD BUG 1: this call THREW TypeError (DecimalRingBuffer not iterable)
      // on the first tick. The fix's toArray() + kind tag must not throw.
      const result = engine.computeFormingCandle(tickCtx);
      engine.setFormingCandle(false);

      expect(result.success).toBe(true);
      const diff = sma5Diff(result);
      expect(diff).not.toBeNull();
      // OLD BUG 2: on tick 2+, a Decimal pushed into a rebuilt float buffer
      // corrupts the running sum → wrong/NaN value. Assert exact decimal.
      expect(diff).toBe(new Decimal(expected).toNumber());
    }
  });

  it('post-tick smaBuffers are rebuilt as DecimalRingBuffer and keep the exact running sum', async () => {
    const { ast } = parse(SOURCE);
    const engine = new ExecutionEngine(compile(ast));
    await runConfirmed(engine);

    const tickCtx = makeTickContext(1700000000000 + BAR_COUNT * 3600000, 0.2);
    engine.setFormingCandle(true);
    const result = engine.computeFormingCandle(tickCtx);
    engine.setFormingCandle(false);
    expect(result.success).toBe(true);

    // The restore must have rebuilt the DECIMAL class (kind tag honored).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const smaBuffers = (engine as any).smaBuffers as Map<string, unknown>;
    expect(smaBuffers.size).toBeGreaterThan(0);
    for (const buf of smaBuffers.values()) {
      expect(buf).toBeInstanceOf(DecimalRingBuffer);
      // Sum stays exact across the rebuild: [0.1×5] → 0.5 at DP=20
      expect((buf as DecimalRingBuffer).getSum().toNumber()).toBe(0.5);
    }

    // After the tick the buffer equals the pre-tick snapshot — executing a
    // confirmed bar with the constant close keeps sma5 at exactly 0.1.
    const confirm = engine.executeBar(
      makeTickContext(1700000000000 + BAR_COUNT * 3600000 + 3600000, CONST_CLOSE),
    );
    expect(confirm.success).toBe(true);
    const smaKey = Array.from(engine.getAllOutputs().keys()).find((k) => k.includes('sma5'));
    const values = engine.getAllOutputs().get(smaKey!)!.values;
    expect(values[values.length - 1]).toBe(new Decimal('0.1').toNumber());
  });
});
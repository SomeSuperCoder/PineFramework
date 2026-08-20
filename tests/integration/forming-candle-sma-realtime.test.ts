/**
 * M5a.1 FORMING-CANDLE REALTIME SMOKE — smaBuffers DecimalRingBuffer rebuild.
 *
 * Locks the M5a.1 fix in forming-candle.ts: the pre-tick smaBuffers snapshot now
 * carries a `kind` tag and the restore rebuilds the buffer as its ORIGINAL class
 * (DecimalRingBuffer.fromArray for decimal buffers).
 *
 * THE OLD BUGS THIS SUITE WOULD CATCH:
 *   1. The old snapshot did `v instanceof RingBuffer ? v.toArray() : [...v]`.
 *      ta.sma (M5a) stores DecimalRingBuffer, which has NO Symbol.iterator →
 *      the FIRST forming-candle tick after any ta.sma use threw
 *      TypeError: DecimalRingBuffer is not iterable.
 *   2. The old restore always rebuilt `RingBuffer.fromArray(number[])` — the
 *      next tick's ta.sma would push a Decimal into a number-typed buffer
 *      (`sum += value` coerces Decimal → corrupted running sum) → wrong value
 *      on subsequent ticks, or NaN.
 *
 * HOW IT VERIFIES THE FIX: constant close=0.1 confirmed bars give sma5 = 0.1
 * exactly (DecimalRingBuffer sum = 0.5 exact). Each forming-candle tick feeds a
 * DIFFERENT close; the tick's executeBar pushes it into the restored buffer, so
 *   tick close=0.2 → window [0.1,0.1,0.1,0.1,0.2] → 0.6/5 = 0.12 EXACTLY
 *   tick close=0.3 → window [0.1,0.1,0.1,0.1,0.3] → 0.7/5 = 0.14 EXACTLY
 *   tick close=0.4 → window [0.1,0.1,0.1,0.1,0.4] → 0.8/5 = 0.16 EXACTLY
 * (the float path gives 0.12000000000000002 / 0.14000000000000001 —
 * the fp-final-gate trap at realtime scope).
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
import { Decimal } from 'decimal.js';
import { configureDecimal } from '../../src/language/runtime/numbers/decimal-config.js';

configureDecimal();

const SOURCE = `//@version=6
indicator("FC SMA Smoke", overlay=true)
plot(ta.sma(close, 5), "sma5")
`;

const BAR_COUNT = 30;
const START = 1700000000000;

function buildContexts(count: number): ExecutionContext[] {
  return Array.from({ length: count }, (_, i) => ({
    barIndex: i,
    barCount: count,
    timestamp: START + i * 3600000,
    open: createSeries('open', [0.1]),
    high: createSeries('high', [0.1]),
    low: createSeries('low', [0.1]),
    close: createSeries('close', [0.1]),
    volume: createSeries('volume', [1000]),
  }));
}

function makeTickContext(close: number): ExecutionContext {
  return {
    barIndex: -1, // forming candle tick — no real bar index
    barCount: 0,
    timestamp: START + BAR_COUNT * 3600000,
    open: createSeries('open', [close]),
    high: createSeries('high', [close]),
    low: createSeries('low', [close]),
    close: createSeries('close', [close]),
    volume: createSeries('volume', [1000]),
  };
}

function sma5Key(engine: ExecutionEngine): string | undefined {
  return Array.from(engine.getAllOutputs().keys()).find((k) => k.includes('sma5'));
}

describe('M5a.1 forming-candle realtime smoke — DecimalRingBuffer rebuild (fp-final-gate lock)', () => {
  it('no throw across multiple forming-candle ticks; sma values are exact decimals', async () => {
    const { ast } = parse(SOURCE);
    const engine = new ExecutionEngine(compile(ast));

    // Confirmed bars — constant close 0.1 → sma5 = 0.1 exactly after warmup.
    const confirmed = await engine.executeBars(buildContexts(BAR_COUNT));
    expect(confirmed.success).toBe(true);
    const key = sma5Key(engine);
    expect(key).toBeDefined();
    const values = Array.from(engine.getOutput(key!)!.values);
    // Bars 0..4 are lookback-nulled (len=5); every later value must be exactly 0.1.
    for (let i = 5; i < values.length; i++) {
      expect(values[i]).toBe(new Decimal('0.1').toNumber());
    }

    // Pre-tick sma buffer is a DecimalRingBuffer (M5a state).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const preBuffer = (engine as any).smaBuffers.values().next().value as DecimalRingBuffer;
    expect(preBuffer).toBeInstanceOf(DecimalRingBuffer);
    expect(preBuffer.getSum().toNumber()).toBe(0.5); // 5 × 0.1, exact

    // OLD BUG 1: the first tick THREW TypeError (DecimalRingBuffer not iterable).
    const ticks = [
      { close: 0.2, expected: '0.12' },
      { close: 0.3, expected: '0.14' },
      { close: 0.4, expected: '0.16' },
    ] as const;

    for (const { close, expected } of ticks) {
      const tickCtx = makeTickContext(close);
      engine.setFormingCandle(true);
      const result = engine.computeFormingCandle(tickCtx);
      engine.setFormingCandle(false);

      expect(result.success).toBe(true);
      // The tick's sma5 value must be present and EXACTLY the decimal mean.
      expect(result.diffOutputs[key!]).toBe(new Decimal(expected).toNumber());
    }
  });

  it('post-tick smaBuffers are rebuilt as DecimalRingBuffer and keep working (sum intact)', async () => {
    const { ast } = parse(SOURCE);
    const engine = new ExecutionEngine(compile(ast));
    await engine.executeBars(buildContexts(BAR_COUNT));

    engine.setFormingCandle(true);
    const r1 = engine.computeFormingCandle(makeTickContext(0.2));
    engine.setFormingCandle(false);
    expect(r1.success).toBe(true);

    // OLD BUG 2: restore rebuilt a float RingBuffer; a Decimal pushed into it
    // corrupts the running sum. After the fix the buffer must be a
    // DecimalRingBuffer with an EXACT sum — the next tick depends on it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffers = (engine as any).smaBuffers as Map<string, DecimalRingBuffer>;
    expect(buffers.size).toBeGreaterThan(0);
    for (const buf of buffers.values()) {
      expect(buf).toBeInstanceOf(DecimalRingBuffer);
      // Restored to the pre-tick snapshot: window [0.1,0.1,0.1,0.1,0.1] → sum 0.5.
      expect(buf.getSum().toNumber()).toBe(0.5);
    }

    // Second consecutive tick must still compute the correct exact value —
    // proves the rebuilt buffer accepts Decimal pushes without corruption.
    engine.setFormingCandle(true);
    const r2 = engine.computeFormingCandle(makeTickContext(0.3));
    engine.setFormingCandle(false);
    expect(r2.success).toBe(true);
    const key = sma5Key(engine);
    expect(key).toBeDefined();
    expect(r2.diffOutputs[key!]).toBe(new Decimal('0.14').toNumber());
  });
});
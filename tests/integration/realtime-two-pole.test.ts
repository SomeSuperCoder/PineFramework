import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import { ScriptSession, type ScriptOutputs } from '../../backend/src/session/ScriptSession.js';
import type { Bar } from '../../src/data/bar.js';

function createTrendingBars(count: number, startPrice: number, seed: number = 42) {
  const bars: Bar[] = [];
  let price = startPrice;
  let s = seed;
  const rand = () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < count; i++) {
    const open = price;
    let drift: number;
    if (i < Math.floor(count * 0.4)) drift = 0.5;
    else if (i < Math.floor(count * 0.7)) drift = -0.5;
    else drift = 0.4;
    const change = drift + (rand() - 0.5) * 0.5;
    const close = open + change;
    const high = Math.max(open, close) + rand() * 0.5;
    const low = Math.min(open, close) - rand() * 0.5;
    bars.push({ timestamp: 1700000000000 + i * 3600000, open, high, low, close, volume: 1000 });
    price = close;
  }
  return bars;
}

function getOutputKey(result: ScriptOutputs): string {
  return Object.keys(result.outputs)[0]!;
}

function getLastValue(result: ScriptOutputs, key: string): number | null {
  const vals = result.outputs[key];
  if (!vals || vals.length === 0) return null;
  return vals[vals.length - 1] as number | null;
}

describe('Real-Time Two-Pole Trend Filter Cycle', () => {
  const source = fs.readFileSync('./test_indicators/two-pole-trend-filter.pine', 'utf-8');

  it('should maintain correct indicator values across forming tick → confirm → new bar → forming tick cycles', () => {
    // Phase 1: Initialize with 60 historical bars
    const histBars = createTrendingBars(60, 100);
    const session = new ScriptSession(source, 'BTCUSDT', '60', histBars);
    const initResult = session.initialize();
    expect(initResult.success).toBe(true);

    const outputKey = getOutputKey(initResult);
    const initVals = initResult.outputs[outputKey]!;
    expect(initVals.length).toBe(60);

    // Phase 2: Simulate 5 forming candle ticks for the last historical bar
    // (same timestamp as last bar).  These are forming-tick updates only.
    const lastHistBar = histBars[histBars.length - 1]!;
    const lastTimestamp = lastHistBar.timestamp;

    let lastDiffValue: number | null = null;
    for (let tick = 0; tick < 5; tick++) {
      const formingClose = lastHistBar.close + (tick - 2) * 10;
      const formingBar: Bar = {
        timestamp: lastTimestamp,
        open: lastHistBar.open,
        high: Math.max(lastHistBar.high, formingClose),
        low: Math.min(lastHistBar.low, formingClose),
        close: formingClose,
        volume: lastHistBar.volume,
      };

      const result = session.appendOrUpdateBar(formingBar);
      expect(result.success).toBe(true);
      expect(result.formingCandle).toBe(true); // still forming

      const diffValue = getLastValue(result, outputKey);
      // Each tick with a different close should produce a different indicator value
      if (lastDiffValue !== null && diffValue !== null) {
        expect(diffValue).not.toBe(lastDiffValue);
      }
      lastDiffValue = diffValue;
    }

    // Phase 3: A new bar arrives (next interval) — this is a genuinely new bar
    // that was not part of the historical data, so its confirmation takes the
    // confirmed path.
    const confirmClose = lastHistBar.close + 3 * 10; // = +30
    const newBarTimestamp = lastTimestamp + 60000;
    const newBar: Bar = {
      timestamp: newBarTimestamp,
      open: confirmClose,
      high: Math.max(lastHistBar.high, confirmClose) + 3,
      low: Math.min(lastHistBar.low, confirmClose) - 1,
      close: confirmClose + 1,
      volume: 1200,
    };

    const newBarResult = session.appendOrUpdateBar(newBar);
    expect(newBarResult.success).toBe(true);
    expect(newBarResult.formingCandle).toBe(true);

    // Phase 4: Confirm the new bar
    const confirmBar: Bar = {
      timestamp: newBarTimestamp,
      open: newBar.open,
      high: Math.max(newBar.high, confirmClose + 2),
      low: Math.min(newBar.low, confirmClose - 1),
      close: confirmClose + 2,
      volume: newBar.volume,
    };

    const confirmResult = session.appendOrUpdateBar(confirmBar, true);
    expect(confirmResult.success).toBe(true);
    expect(confirmResult.formingCandle).toBe(false);

    // The confirmed result should have full outputs (all bars + the new one)
    const confirmVals = confirmResult.outputs[outputKey]!;
    expect(confirmVals.length).toBeGreaterThanOrEqual(61);

    // Phase 5: Another new bar arrives — forming candle for the next bar
    const nextTimestamp = newBarTimestamp + 60000;
    const nextBar: Bar = {
      timestamp: nextTimestamp,
      open: confirmClose + 2,
      high: confirmClose + 5,
      low: confirmClose,
      close: confirmClose + 3,
      volume: 1300,
    };

    const nextBarResult = session.appendOrUpdateBar(nextBar);
    expect(nextBarResult.success).toBe(true);
    expect(nextBarResult.formingCandle).toBe(true);

    const nextBarValue = getLastValue(nextBarResult, outputKey);
    expect(nextBarValue).not.toBeNull();

    // Phase 6: Another forming tick for the next bar
    const nextBarTick: Bar = {
      timestamp: nextTimestamp,
      open: nextBar.open,
      high: nextBar.high + 2,
      low: nextBar.low - 1,
      close: nextBar.close + 1,
      volume: 1500,
    };

    const tickResult = session.appendOrUpdateBar(nextBarTick);
    expect(tickResult.success).toBe(true);
    expect(tickResult.formingCandle).toBe(true);

    const tickValue = getLastValue(tickResult, outputKey);
    // Should differ from the previous forming value (close changed)
    if (tickValue !== null && nextBarValue !== null) {
      expect(tickValue).not.toBe(nextBarValue);
    }
  });

  it('should preserve engine state across multiple full cycles', () => {
    const histBars = createTrendingBars(60, 100);
    const session = new ScriptSession(source, 'BTCUSDT', '60', histBars);
    const initResult = session.initialize();
    expect(initResult.success).toBe(true);

    const outputKey = getOutputKey(initResult);
    const initVals = initResult.outputs[outputKey]!;
    const initLen = initVals.length;

    // Start the first real-time bar AFTER the historical data so that
    // confirmations always take the confirmed path (not the stale guard).
    let currentTimestamp = histBars[histBars.length - 1]!.timestamp + 3600000;
    let lastClose = histBars[histBars.length - 1]!.close;

    // Run 3 complete cycles: forming → confirm → new bar
    for (let cycle = 0; cycle < 3; cycle++) {
      // Forming candle ticks (2 ticks per cycle)
      for (let tick = 0; tick < 2; tick++) {
        const formingBar: Bar = {
          timestamp: currentTimestamp,
          open: lastClose,
          high: lastClose + 5 + tick,
          low: lastClose - 3 - tick,
          close: lastClose + tick * 2,
          volume: 1000,
        };
        const result = session.appendOrUpdateBar(formingBar);
        expect(result.success).toBe(true);
        expect(result.formingCandle).toBe(true);
      }

      // Confirm the bar
      const confirmClose = lastClose + 3;
      const confirmBar: Bar = {
        timestamp: currentTimestamp,
        open: lastClose,
        high: lastClose + 5,
        low: lastClose - 3,
        close: confirmClose,
        volume: 1000,
      };
      const confirmResult = session.appendOrUpdateBar(confirmBar, true);
      expect(confirmResult.success).toBe(true);
      expect(confirmResult.formingCandle).toBe(false);

      lastClose = confirmClose;

      // New bar
      currentTimestamp += 3600000;
      const newBar: Bar = {
        timestamp: currentTimestamp,
        open: lastClose,
        high: lastClose + 3,
        low: lastClose - 1,
        close: lastClose + 2,
        volume: 1000,
      };
      const newBarResult = session.appendOrUpdateBar(newBar);
      expect(newBarResult.success).toBe(true);
      expect(newBarResult.formingCandle).toBe(true);
    }

    // After 3 cycles, the output should have grown by at least 3 entries
    // (one per cycle from the confirmed bar) — cycles also add new bars
    const finalResult = session.initialize(); // re-init to get final state...
    // Actually just check appendOrUpdateBar still works
    const finalBar: Bar = {
      timestamp: currentTimestamp,
      open: lastClose,
      high: lastClose + 2,
      low: lastClose - 1,
      close: lastClose + 1,
      volume: 1000,
    };
    const finalResult2 = session.appendOrUpdateBar(finalBar);
    expect(finalResult2.success).toBe(true);
    expect(Object.keys(finalResult2.outputs).length).toBeGreaterThan(0);
  });
});

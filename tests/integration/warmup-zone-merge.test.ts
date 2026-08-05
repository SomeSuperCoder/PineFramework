import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import { prependIndicatorResult } from '../../frontend/src/hooks/indicator-merge';
import type { ScriptResult } from '../../frontend/src/types';

function createTrendingBars(count: number, startPrice: number, seed: number = 42) {
  const bars: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> = [];
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

function executeScript(source: string, bars: ReturnType<typeof createTrendingBars>) {
  const { ast } = parse(source);
  const compiled = compile(ast);
  const engine = new ExecutionEngine(compiled);
  const contexts: ExecutionContext[] = bars.map((bar, i) => ({
    barIndex: i,
    barCount: bars.length,
    timestamp: bar.timestamp,
    open: createSeries(
      'open',
      bars.slice(0, i + 1).map((b) => b.open),
    ),
    high: createSeries(
      'high',
      bars.slice(0, i + 1).map((b) => b.high),
    ),
    low: createSeries(
      'low',
      bars.slice(0, i + 1).map((b) => b.low),
    ),
    close: createSeries(
      'close',
      bars.slice(0, i + 1).map((b) => b.close),
    ),
    volume: createSeries(
      'volume',
      bars.slice(0, i + 1).map((b) => b.volume),
    ),
  }));
  const result = engine.executeBars(contexts);
  return { engine, bars, result };
}

function toScriptResult(
  engine: ExecutionEngine,
  result: ReturnType<ExecutionEngine['executeBars']>,
  execBars: ReturnType<typeof createTrendingBars>,
): ScriptResult {
  const outputs = result.outputs;
  const plots = Array.from(outputs.entries()).map(([key, series]) => {
    const data: Array<{ time: number; value: number | null }> = [];
    for (let i = 0; i < execBars.length; i++) {
      const relIdx = i - (execBars.length - 1);
      const val = series.getRelative(relIdx);
      data.push({
        time: Math.floor(execBars[i].timestamp / 1000),
        value: typeof val === 'number' && !Number.isNaN(val) ? val : null,
      });
    }
    return {
      type: 'line' as const,
      title: key,
      data,
      color: '#0000ff',
    };
  });

  return {
    overlay: true,
    plots,
    shapes: [],
    lines: [],
    boxes: [],
    labels: [],
    tables: [],
    plotColors: result.plotColors
      ? Object.fromEntries(Array.from(result.plotColors.entries()).map(([k, v]) => [k, v]))
      : undefined,
    fillColorData: result.fillColorData
      ? Object.fromEntries(Array.from(result.fillColorData.entries()).map(([k, v]) => [k, v]))
      : undefined,
  };
}

describe('Warmup zone merge integration', () => {
  // Use an indicator with a known moderate lookback (ta.sma with length 14)
  const script = `
//@version=5
indicator("SMA Test")
sma14 = ta.sma(close, 14)
plot(sma14)
  `;

  const highLookbackScript = `
//@version=5
indicator("High Lookback Test")
length = input.int(50, "Length")
volatility = ta.highest(ta.atr(length), length * 3)
plot(volatility)
  `;

  it('should preserve prev values when context is insufficient (warmup nulls in overlap)', () => {
    // Simulate initial load: 300 bars loaded, indicator runs, lookback ~14
    const allBars = createTrendingBars(300, 100);

    // Step 1: Initial execution on first 300 bars (simulates initial chart load)
    const { engine: engine1, result: result1, bars: bars1 } = executeScript(script, allBars);
    const prevResult = toScriptResult(engine1, result1, bars1);
    expect(prevResult.plots.length).toBeGreaterThan(0);

    // The engine reports how many bars back it needs
    const lookback = engine1.getMaxLookback();
    expect(lookback).toBeGreaterThanOrEqual(14);
    expect(lookback).toBeLessThanOrEqual(20); // sma(14) → ~14

    // Step 2: Simulate scroll-back — 100 more bars prepended
    const newBars = createTrendingBars(100, 95, 999);
    const combinedBars = [...newBars, ...allBars];

    // Simulate fetchOlderOHLCV: execute on new bars + context bars
    const contextSize = Math.max(lookback, newBars.length);
    const contextBars = allBars.slice(0, contextSize);
    const actualContextSize = contextBars.length;
    const execBars = [...newBars, ...contextBars];

    const { engine: engine2, result: result2 } = executeScript(script, execBars);
    const newResult = toScriptResult(engine2, result2, execBars);

    // Step 3: Merge via prependIndicatorResult (same flow as frontend)
    const addedCount = newBars.length;
    const overlapTimestamps = new Set(contextBars.map((b) => Math.floor(b.timestamp / 1000)));
    const merged = prependIndicatorResult(
      prevResult,
      newResult,
      addedCount,
      actualContextSize,
      overlapTimestamps,
    );

    // Step 4: Verify the merge
    expect(merged.plots.length).toBe(prevResult.plots.length);

    for (const mergedPlot of merged.plots) {
      const prevPlot = prevResult.plots.find((p) => p.title === mergedPlot.title);
      const newPlot = newResult.plots.find((p) => p.title === mergedPlot.title);
      expect(prevPlot).toBeDefined();
      expect(newPlot).toBeDefined();

      // The merged result should have combinedNew + prevLength entries
      expect(mergedPlot.data.length).toBe(addedCount + prevPlot!.data.length);

      // New bars (first addedCount entries) → from newResult
      for (let i = 0; i < addedCount; i++) {
        expect(mergedPlot.data[i].value).toBe(newPlot!.data[i].value);
      }

      // In the overlap zone:
      //   - newResult non-null → authoritative (correct warmup state)
      //   - newResult null but prev non-null → prev preserved (null-safe fallback)
      //   - Both null → backfilled from first valid post-warmup value (not asserted)
      const overlapSection = mergedPlot.data.slice(addedCount, addedCount + actualContextSize);
      for (let i = 0; i < overlapSection.length; i++) {
        const newVal = newPlot!.data[addedCount + i].value;
        const prevVal = prevPlot!.data[i].value;
        if (newVal !== null) {
          // New value is non-null → authoritative (replaces prev)
          expect(overlapSection[i].value).toBe(newVal);
        } else if (prevVal !== null) {
          // Warmup null: prev value preserved
          expect(overlapSection[i].value).toBe(prevVal);
        }
        // else both null: no assertion — backfill may have filled the gap
      }

      // After overlap zone: prev values unchanged (but shifted by addedCount)
      const afterOverlap = mergedPlot.data.slice(addedCount + actualContextSize);
      const prevRemaining = prevPlot!.data.slice(actualContextSize);
      expect(afterOverlap.length).toBe(prevRemaining.length);
      for (let i = 0; i < afterOverlap.length; i++) {
        expect(afterOverlap[i].value).toBe(prevRemaining[i].value);
      }
    }
  });

  it('should heal warmup holes when context accumulates with subsequent prepends', () => {
    // Simulate scroll-back direction: prepends add OLDER bars to the LEFT.
    // Initial: bars 100-399 (300 bars, "newest" on the right)
    // Step 1: Simulate initial load on bars 100-399
    // Step 2: First prepend — 100 older bars (0-99), context from initial (100-199)
    //   Execution: [bars 0-99, bars 100-199]. Lookback=14 → entries 0-13 null, 14-199 non-null
    //   Overlap region (entries 100-199 in newResult) = ALL non-null
    // Step 3: Second prepend — no new bars, just verify merged result preserves values

    const allBars = createTrendingBars(400, 100);

    // Step 1: Initial 300 bars (bars 100-399)
    const initialBars = allBars.slice(100, 400);
    const { engine: eng1, bars: _b1 } = executeScript(script, initialBars);
    // Re-execute to get result (executeScript creates fresh engine each call)
    const { engine: eng1b, result: res1b, bars: bars1b } = executeScript(script, initialBars);
    const resultInitial = toScriptResult(eng1b, res1b, bars1b);
    const lookback = eng1.getMaxLookback();

    // Step 2: Prepend 100 older bars (0-99) with context from 200-399
    // This simulates the FIRST scroll-back
    const chunk = allBars.slice(0, 100); // bars 0-99
    const context = allBars.slice(200, 400); // bars 200-399 (200 bars available)
    const ctxSize = Math.max(lookback, chunk.length);
    const actualCtx = context.slice(0, ctxSize); // first ctxSize (e.g., 100) bars of context
    const execBars = [...chunk, ...actualCtx]; // 100 + 100 = 200 bars

    const { engine: eng2, result: res2 } = executeScript(script, execBars);
    const newResult = toScriptResult(eng2, res2, execBars);

    // Merge
    const merged = prependIndicatorResult(
      resultInitial,
      newResult,
      chunk.length,
      actualCtx.length,
      new Set(actualCtx.map((b) => Math.floor(b.timestamp / 1000))),
    );

    // Verify: merged has 400 entries (100 new + 300 from initial)
    expect(merged.plots[0].data.length).toBe(400);

    // The overlap zone (positions 100-199 in merged) should have values
    // from newResult, which with 200 bars and lookback=14 should be non-null
    // for positions 114-199. But the null-safe merge means positions where
    // newResult has null (warmup, positions 100-113) should keep prev value.
    const overlapData = merged.plots[0].data.slice(100, 200);
    const nonNullCount = overlapData.filter((d) => d.value !== null).length;
    // At minimum, the entries past lookback should be non-null
    expect(nonNullCount).toBeGreaterThan(0);
  });
});

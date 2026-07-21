/**
 * Integration test: forming candle tick accumulation.
 *
 * Verifies that computeFormingCandle properly restores global scope variable
 * series lengths after each tick. Without this restoration, phantom entries
 * accumulate across N ticks, causing historical references like trend[1] to
 * read from the wrong series offset when the next confirmed bar executes.
 *
 * Bug: cloneRuntimeScope (forming-candle.ts:125) copied the post-tick state
 * with extra entries added by pushBarValues and setVariableValue, but never
 * truncated them back to pre-tick lengths.
 */
import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

function loadBars(): {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}[] {
  const raw = JSON.parse(fs.readFileSync('./tests/fixtures/solusdt-5m-jul17.json', 'utf-8'));
  if (raw.retCode !== 0) throw new Error(`Bybit API error: ${raw.retMsg}`);
  return raw.result.list.reverse().map((k: any[]) => ({
    timestamp: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  }));
}

function buildContexts(bars: ReturnType<typeof loadBars>): ExecutionContext[] {
  return bars.map((bar, i) => ({
    barIndex: i,
    barCount: bars.length,
    timestamp: bar.timestamp,
    open: createSeries('open', bars.slice(0, i + 1).map((b) => b.open)),
    high: createSeries('high', bars.slice(0, i + 1).map((b) => b.high)),
    low: createSeries('low', bars.slice(0, i + 1).map((b) => b.low)),
    close: createSeries('close', bars.slice(0, i + 1).map((b) => b.close)),
    volume: createSeries('volume', bars.slice(0, i + 1).map((b) => b.volume)),
  }));
}

/**
 * Extract a variable's values from the engine's global scope.
 */
function getVar(engine: ExecutionEngine, name: string): any[] | null {
  const b = (engine as any).globalScope.variables.get(name);
  return b ? b.series.values : null;
}

/**
 * Build a tick context for a bar at `timestamp` with given OHLCV.
 * The forming candle tick reuses the LAST bar's context, updating it in place.
 */
function makeTickContext(
  timestamp: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
): ExecutionContext {
  return {
    barIndex: -1, // tick doesn't have a real bar index
    barCount: 0,
    timestamp,
    open: createSeries('open', [open]),
    high: createSeries('high', [high]),
    low: createSeries('low', [low]),
    close: createSeries('close', [close]),
    volume: createSeries('volume', [volume]),
  };
}

describe('Forming Candle Accumulation', () => {
  const source = fs.readFileSync('./test_indicators/q-trend.pine', 'utf-8');
  const { ast } = parse(source);
  const compiled = compile(ast);
  const fullBars = loadBars();

  // Use enough bars for lookback-based indicators
  const testBars = fullBars.slice(-300);

  it('restores variable series lengths after each forming candle tick', () => {
    const engine = new ExecutionEngine(compiled);
    const contexts = buildContexts(testBars);
    engine.executeBars(contexts);

    // Pick a few key variables to track
    const varNames = ['src', 'trend', 'atr', 'len', 'h', 'l', 'm', 'flag'];

    // Get baseline lengths after initial execution
    const initialLengths: Record<string, number> = {};
    for (const name of varNames) {
      const vals = getVar(engine, name);
      if (vals) {
        initialLengths[name] = vals.length;
      }
    }
    expect(Object.keys(initialLengths).length).toBeGreaterThan(0);

    // Simulate N forming candle ticks
    const numTicks = 30;

    // After each tick, verify lengths are restored to initial
    for (let tick = 0; tick < numTicks; tick++) {
      const bar = testBars[testBars.length - 1];
      const tickCtx = makeTickContext(
        bar.timestamp + 300_000, // 5 min later (same timestamp for forming candle)
        bar.close,
        bar.close * 1.001,
        bar.close * 0.999,
        bar.close * 1.0005,
        bar.volume,
      );

      engine.setFormingCandle(true);
      const result = engine.computeFormingCandle(tickCtx);

      // After the tick, variable series lengths MUST be restored
      for (const name of varNames) {
        const vals = getVar(engine, name);
        if (vals) {
          const expected = initialLengths[name]!;
          if (vals.length !== expected) {
            // Capture what happened for debugging
            const extra = vals.slice(expected);
            throw new Error(
              `Variable '${name}' length ${vals.length} after tick ${tick + 1}/${numTicks} ` +
              `(expected ${expected}). First extra value: ${JSON.stringify(extra[0])}. ` +
              `This indicates cloneRuntimeScope preserved post-tick entries without truncation.`
            );
          }
        }
      }
    }

    // After N ticks, execute a confirmed bar and verify shapes for overlapping
    // bars match what a fresh engine produces.
    const lastBar = testBars[testBars.length - 1];
    const confirmedBar = {
      timestamp: lastBar.timestamp + 300_000,
      open: lastBar.close,
      high: lastBar.close * 1.001,
      low: lastBar.close * 0.999,
      close: lastBar.close * 1.0005,
      volume: lastBar.volume,
    };
    const extendedBars = [...testBars, confirmedBar];

    // Run the tick-exhausted engine on the new bar
    engine.setFormingCandle(false);
    const execCtx = buildContexts(extendedBars);
    const tickResult = engine.executeBar(execCtx[execCtx.length - 1]!);
    const tickShapes = (tickResult.shapes || []).map((s: any) => ({
      time: s.time,
      text: s.text,
      style: s.style,
      location: s.location,
    }));

    // Run a fresh engine on the same extended bar set for comparison
    const freshEngine = new ExecutionEngine(compiled);
    const freshCtx = buildContexts(extendedBars);
    const freshResult = freshEngine.executeBars(freshCtx);
    const freshShapes = (freshResult.shapes || []).map((s: any) => ({
      time: s.time,
      text: s.text,
      style: s.style,
      location: s.location,
    }));

    // Compare shapes for overlapping bars only
    const initialBarTimestamps = new Set(testBars.map((b) => b.timestamp));
    const tickOverlap = tickShapes.filter((s: any) => initialBarTimestamps.has(s.time));
    const freshOverlap = freshShapes.filter((s: any) => initialBarTimestamps.has(s.time));

    const tickMap = new Map(tickOverlap.map((s: any) => [s.time, s]));
    const freshMap = new Map(freshOverlap.map((s: any) => [s.time, s]));

    const diffs: string[] = [];
    for (const [time, tickS] of tickMap) {
      const freshS = freshMap.get(time);
      if (!freshS) {
        diffs.push(`Shape at ${time} (${tickS.text}): missing from fresh engine`);
      } else if (JSON.stringify(tickS) !== JSON.stringify(freshS)) {
        diffs.push(`Shape at ${time}: ${JSON.stringify(tickS)} vs ${JSON.stringify(freshS)}`);
      }
    }
    for (const [time, freshS] of freshMap) {
      if (!tickMap.has(time)) {
        diffs.push(`Shape at ${time} (${freshS.text}): missing from tick engine`);
      }
    }

    if (diffs.length > 0) {
      console.log(`\nMISMATCHES after ${numTicks} ticks (${diffs.length}):`);
      for (const d of diffs) console.log(`  ✗ ${d}`);
    }

    expect(diffs).toEqual([]);
  });
});

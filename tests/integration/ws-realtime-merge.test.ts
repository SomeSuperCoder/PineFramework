/**
 * Integration test: real-time WS update correctness.
 *
 * Simulates the full pipeline:
 *   1. Initial HTTP execution → ScriptResult with shapes/labels/plots
 *   2. A new confirmed bar arrives → WS session re-executes on extended bar set
 *   3. The WS sends a "full replacement" execution result (confirmed bar path)
 *   4. Frontend processes via buildScriptResult
 *   5. Verify shapes/labels/plots for overlapping bars are IDENTICAL
 *
 * If the engine produces different shapes for the same bars (because the WS
 * session has a different bar set or internal state), the chart would show
 * corrupted labels on those bars.
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

/**
 * Build a minimal ExecutionContext for each bar — mirrors what barsToContext()
 * does in the real pipeline.
 */
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

describe('WS Real-Time Merge Correctness', () => {
  const source = fs.readFileSync('./test_indicators/q-trend.pine', 'utf-8');
  const { ast } = parse(source);
  const compiled = compile(ast);
  const fullBars = loadBars();

  // Use last 50 bars for the test (so it's fast but has enough history
  // for lookback-based indicators like Q-Trend with period=200).
  // We need at LEAST 200 bars for Q-Trend's period, so take the last 300.
  const testBars = fullBars.slice(-300);

  it('shapes and labels are identical when engine runs on the same data plus one extra bar', () => {
    // === STEP 1: Initial execution (simulating HTTP load) ===
    const engine1 = new ExecutionEngine(compiled);
    const contexts1 = buildContexts(testBars);
    const result1 = engine1.executeBars(contexts1);

    // Get shapes from initial execution
    const initialShapes = (result1.shapes || []).map((s: any) => ({
      time: s.time,
      text: s.text,
      style: s.style,
      location: s.location,
    }));
    const initialLabels = (result1.labels || []).map((l: any) => ({
      time: l.time,
      text: l.text,
    }));

    // === STEP 2: Simulate a new confirmed bar arriving ===
    // Create a bar that follows the last test bar
    const lastBar = testBars[testBars.length - 1];
    const newBar = {
      timestamp: lastBar.timestamp + 300_000, // 5 min later
      open: lastBar.close,
      high: lastBar.close * 1.001,
      low: lastBar.close * 0.999,
      close: lastBar.close * 1.0005,
      volume: lastBar.volume,
    };
    const extendedBars = [...testBars, newBar];

    // === STEP 3: WS session executes on extended bar set ===
    // This simulates what the WS backend does: start fresh on ALL bars,
    // then process the new confirmed bar.
    const engine2 = new ExecutionEngine(compiled);
    const contexts2 = buildContexts(extendedBars);
    const result2 = engine2.executeBars(contexts2);

    const wsShapes = (result2.shapes || []).map((s: any) => ({
      time: s.time,
      text: s.text,
      style: s.style,
      location: s.location,
    }));
    const wsLabels = (result2.labels || []).map((l: any) => ({
      time: l.time,
      text: l.text,
    }));

    // === STEP 4: Compare shapes for OVERLAPPING bars ===
    // Shapes for testBars (bars 0..299) should be identical between
    // initial execution and WS execution.
    const initialBarTimestamps = new Set(testBars.map((b) => b.timestamp));
    const overlappingInitialShapes = initialShapes.filter((s) => initialBarTimestamps.has(s.time));
    const overlappingWsShapes = wsShapes.filter((s) => initialBarTimestamps.has(s.time));

    // Build lookup maps by timestamp
    const initialShapeMap = new Map(overlappingInitialShapes.map((s) => [s.time, s]));
    const wsShapeMap = new Map(overlappingWsShapes.map((s) => [s.time, s]));

    const diffs: string[] = [];

    // Check each initial shape exists in WS shapes with same attributes
    for (const [time, initialS] of initialShapeMap) {
      const wsS = wsShapeMap.get(time);
      if (!wsS) {
        diffs.push(`Shape at time ${time} (${initialS.text}): missing from WS execution`);
        continue;
      }
      if (wsS.text !== initialS.text) {
        diffs.push(`Shape at time ${time}: text changed "${initialS.text}" → "${wsS.text}"`);
      }
      if (wsS.style !== initialS.style) {
        diffs.push(`Shape at time ${time}: style changed "${initialS.style}" → "${wsS.style}"`);
      }
      if (wsS.location !== initialS.location) {
        diffs.push(`Shape at time ${time}: location changed "${initialS.location}" → "${wsS.location}"`);
      }
    }

    // Check for extra shapes in WS that weren't in initial (shouldn't happen for overlapping bars)
    for (const [time, wsS] of wsShapeMap) {
      if (!initialShapeMap.has(time)) {
        diffs.push(`Shape at time ${time} (${wsS.text}): unexpected extra shape in WS execution`);
      }
    }

    // === STEP 5: Compare labels for overlapping bars ===
    const overlappingInitialLabels = initialLabels.filter((l) => initialBarTimestamps.has(l.time));
    const overlappingWsLabels = wsLabels.filter((l) => initialBarTimestamps.has(l.time));

    const initialLabelMap = new Map(overlappingInitialLabels.map((l) => [l.time, l]));
    const wsLabelMap = new Map(overlappingWsLabels.map((l) => [l.time, l]));

    for (const [time, initialL] of initialLabelMap) {
      const wsL = wsLabelMap.get(time);
      if (!wsL) {
        diffs.push(`Label at time ${time} (${initialL.text}): missing from WS execution`);
        continue;
      }
      if (wsL.text !== initialL.text) {
        diffs.push(`Label at time ${time}: text changed "${initialL.text}" → "${wsL.text}"`);
      }
    }

    // === STEP 6: Compare OUTPUT VALUES for overlapping bars ===
    // Sample the first output series
    const outputKeys = result1.outputs ? Array.from(result1.outputs.keys()) : [];
    const sampleKey = outputKeys.find((k) => !k.includes('__')); // Find a non-meta key
    if (sampleKey) {
      const initialOutputs = (result1.outputs as Map<string, any>).get(sampleKey);
      const wsOutputs = (result2.outputs as Map<string, any>).get(sampleKey);
      if (initialOutputs && wsOutputs) {
        const initialVals = Array.from(initialOutputs.values);
        const wsVals = Array.from(wsOutputs.values);
        const overlapLen = Math.min(initialVals.length, testBars.length);
        for (let i = 0; i < overlapLen; i++) {
          const iv = typeof initialVals[i] === 'number' ? initialVals[i] : null;
          const wv = typeof wsVals[i] === 'number' ? wsVals[i] : null;
          if (iv !== null && wv !== null && Math.abs(iv - wv) > 0.0001) {
            diffs.push(`Output ${sampleKey}[${i}]: initial=${iv} ws=${wv}`);
          }
        }
      }
    }

    if (diffs.length > 0) {
      console.log(`\nMISMATCHES (${diffs.length}):`);
      for (const d of diffs) console.log(`  ✗ ${d}`);
      console.log(`\nInitial shapes: ${JSON.stringify(overlappingInitialShapes)}`);
      console.log(`WS shapes: ${JSON.stringify(overlappingWsShapes)}`);
    }

    expect(diffs).toEqual([]);
  });
});

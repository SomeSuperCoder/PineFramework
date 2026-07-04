import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

function makeContexts(count: number, startPrice = 100, baseTime = 1000000): ExecutionContext[] {
  const contexts: ExecutionContext[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = open + 2;
    contexts.push({
      barIndex: i,
      barCount: count,
      timestamp: baseTime + i * 60000,
      open: createSeries('open', [open]),
      high: createSeries('high', [Math.max(open, close) + 1]),
      low: createSeries('low', [Math.min(open, close) - 1]),
      close: createSeries('close', [close]),
      volume: createSeries('volume', [1000]),
    });
    price = close;
  }
  return contexts;
}

function makeContext(
  price: number,
  index: number,
  total: number,
  timestamp: number,
): ExecutionContext {
  return {
    barIndex: index,
    barCount: total,
    timestamp,
    open: createSeries('open', [price]),
    high: createSeries('high', [price + 3]),
    low: createSeries('low', [price - 1]),
    close: createSeries('close', [price + 2]),
    volume: createSeries('volume', [1000]),
  };
}

const SMA_SCRIPT = `//@version=6
indicator("SMA Test")
smaValue = ta.sma(close, 5)
plot(smaValue)
`;

function compileScript(source: string): ExecutionEngine {
  const { ast } = parse(source);
  const result = compile(ast);
  return new ExecutionEngine(result);
}

describe('Real-Time Execution Pipeline', () => {
  describe('executeRealtimeBar()', () => {
    it('should execute a single new bar preserving prior state', () => {
      const engine = compileScript(SMA_SCRIPT);
      const initialContexts = makeContexts(10, 100, 1000000);

      engine.executeBars(initialContexts);

      const lastCtx = initialContexts[initialContexts.length - 1]!;
      const newContext = makeContext(
        (lastCtx.close.getRelative(0) as number) + 2,
        10,
        11,
        lastCtx.timestamp + 60000,
      );

      const result = engine.executeRealtimeBar(newContext);
      expect(result.success).toBe(true);
    });

    it('should return outputs from realtime bar execution', () => {
      const engine = compileScript(SMA_SCRIPT);
      const initialContexts = makeContexts(15, 100, 1000000);

      engine.executeBars(initialContexts);

      const lastCtx = initialContexts[initialContexts.length - 1]!;
      const newContext = makeContext(
        (lastCtx.close.getRelative(0) as number) + 2,
        15,
        16,
        lastCtx.timestamp + 60000,
      );

      const result = engine.executeRealtimeBar(newContext);
      expect(result.outputs).toBeDefined();
      expect(result.outputs.size).toBeGreaterThan(0);
    });

    it('should return shapes, fills, and strategyMarkers from realtime bar', () => {
      const engine = compileScript(SMA_SCRIPT);
      const initialContexts = makeContexts(10, 100, 1000000);

      engine.executeBars(initialContexts);

      const lastCtx = initialContexts[initialContexts.length - 1]!;
      const newContext = makeContext(
        (lastCtx.close.getRelative(0) as number) + 2,
        10,
        11,
        lastCtx.timestamp + 60000,
      );

      const result = engine.executeRealtimeBar(newContext);
      expect(Array.isArray(result.shapes)).toBe(true);
      expect(Array.isArray(result.fills)).toBe(true);
      expect(Array.isArray(result.strategyMarkers)).toBe(true);
    });
  });

  describe('Snapshot and rollback', () => {
    it('should create snapshots during realtime bar execution', () => {
      const engine = compileScript(SMA_SCRIPT);
      const contexts = makeContexts(5, 100, 1000000);
      engine.executeBars(contexts);

      const lastCtx = contexts[contexts.length - 1]!;
      const newContext = makeContext(
        (lastCtx.close.getRelative(0) as number) + 2,
        5,
        6,
        lastCtx.timestamp + 60000,
      );

      engine.createSnapshot();
      engine.executeRealtimeBar(newContext);

      const rollbackResult = engine.rollbackToSnapshot(-1);
      expect(rollbackResult).toBe(true);
    });
  });

  describe('Var persistence across realtime bars', () => {
    it('should preserve var state across incremental realtime bar executions', () => {
      const VAR_SCRIPT = `//@version=6
indicator("Var Test")
var counter = 0.0
counter := counter + 1
plot(counter)
`;

      const engine = compileScript(VAR_SCRIPT);
      const contexts = makeContexts(5, 100, 1000000);
      engine.executeBars(contexts);

      const counterOutput = engine.getOutput('counter');
      expect(counterOutput).toBeDefined();
      expect(counterOutput!.values[counterOutput!.values.length - 1]).toBe(5);

      const lastCtx = contexts[contexts.length - 1]!;
      for (let i = 0; i < 3; i++) {
        const newCtx = makeContext(
          (lastCtx.close.getRelative(0) as number) + 2,
          5 + i,
          6 + i,
          lastCtx.timestamp + (i + 1) * 60000,
        );
        engine.executeRealtimeBar(newCtx);
      }

      const finalOutput = engine.getOutput('counter');
      expect(finalOutput!.values[finalOutput!.values.length - 1]).toBe(8);
    });
  });

  describe('execution_result message format', () => {
    it('should produce valid execution result with all required fields', () => {
      const engine = compileScript(SMA_SCRIPT);
      const contexts = makeContexts(10, 100, 1000000);
      const result = engine.executeBars(contexts);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('outputs');
      expect(result).toHaveProperty('shapes');
      expect(result).toHaveProperty('fills');
      expect(result).toHaveProperty('strategyMarkers');
    });
  });
});

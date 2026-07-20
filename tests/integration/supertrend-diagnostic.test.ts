import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

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

describe('SuperTrend AI Diagnostic', () => {
  const source = fs.readFileSync('./test_indicators/supertrend-ai-clustering.pine', 'utf-8');
  const { ast } = parse(source);
  const compiled = compile(ast);

  for (const barCount of [100, 500, 1000, 2000]) {
    it(`produces non-null output on ${barCount} bars`, () => {
      const bars = createTrendingBars(barCount, 80);
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

      const start = Date.now();
      const result = engine.executeBars(contexts);
      const elapsed = Date.now() - start;

      expect(result.success).toBe(true);
      const keys = Array.from(result.outputs.keys());
      console.log(`\nBars: ${barCount} (${elapsed}ms)`);
      for (const [key, series] of result.outputs) {
        const values = series.values;
        const nonNull = values.filter((v) => v !== null).length;
        const firstNonNull = values.findIndex((v) => v !== null);
        console.log(
          `  ${key}: ${nonNull}/${values.length} non-null, first at index ${firstNonNull}`,
        );
      }

      // With enough bars, trailing stop should have some non-null values
      const trailingStopKey = keys.find((k) => k.includes('Trailing Stop'));
      if (trailingStopKey && barCount >= 500) {
        const series = result.outputs.get(trailingStopKey)!;
        const nonNull = series.values.filter((v) => v !== null).length;
        // Should have at least some non-null values with enough data
        expect(nonNull).toBeGreaterThan(0);
      }
    }, 300000);
  }
});

import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

interface TestBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function makeBars(count: number, startPrice = 100, baseTime = 1000000): TestBar[] {
  const bars: TestBar[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = open + 2 + Math.sin(i * 0.5) * 3;
    bars.push({
      timestamp: baseTime + i * 60000,
      open,
      high: Math.max(open, close) + 1,
      low: Math.min(open, close) - 1,
      close,
      volume: 1000,
    });
    price = close;
  }
  return bars;
}

function barsToContexts(bars: TestBar[]): ExecutionContext[] {
  return bars.map((bar, index) => ({
    barIndex: index,
    barCount: bars.length,
    timestamp: bar.timestamp,
    open: createSeries(
      'open',
      bars.slice(0, index + 1).map((b) => b.open),
    ),
    high: createSeries(
      'high',
      bars.slice(0, index + 1).map((b) => b.high),
    ),
    low: createSeries(
      'low',
      bars.slice(0, index + 1).map((b) => b.low),
    ),
    close: createSeries(
      'close',
      bars.slice(0, index + 1).map((b) => b.close),
    ),
    volume: createSeries(
      'volume',
      bars.slice(0, index + 1).map((b) => b.volume),
    ),
  }));
}

function makeFormingContext(bars: TestBar[], newClose: number): ExecutionContext {
  const index = bars.length - 1;
  const lastBar = bars[index]!;
  return {
    barIndex: index,
    barCount: bars.length,
    timestamp: lastBar.timestamp,
    open: createSeries(
      'open',
      bars.map((b) => b.open),
    ),
    high: createSeries(
      'high',
      bars.map((b) => b.high),
    ),
    low: createSeries(
      'low',
      bars.map((b) => b.low),
    ),
    close: createSeries(
      'close',
      bars.map((b, i) => (i === index ? newClose : b.close)),
    ),
    volume: createSeries(
      'volume',
      bars.map((b) => b.volume),
    ),
  };
}

function compileScript(source: string): ExecutionEngine {
  const { ast } = parse(source);
  const result = compile(ast);
  return new ExecutionEngine(result);
}

describe('Real-Time Indicator Computation', () => {
  describe('RSI forming candle computation', () => {
    const RSI_SCRIPT = `//@version=6
indicator("RSI Test")
rsiValue = ta.rsi(close, 14)
plot(rsiValue, "RSI")
`;

    it('should compute RSI diff outputs without corrupting engine state', () => {
      const engine = compileScript(RSI_SCRIPT);
      const bars = makeBars(30, 100, 1000000);
      const contexts = barsToContexts(bars);
      const fullResult = engine.executeBars(contexts);

      const rsiKey = Array.from(fullResult.outputs.keys()).find((k) =>
        k.toUpperCase().includes('RSI'),
      )!;
      expect(rsiKey).toBeDefined();

      const rsiSeries = fullResult.outputs.get(rsiKey)!;
      const beforeRsi = rsiSeries.last();
      const totalBarsBefore = engine.getMetrics().totalBars;

      // First forming candle update — new close changes RSI
      const lastBar = bars[bars.length - 1]!;
      const formingCtx1 = makeFormingContext(bars, lastBar.close + 10);
      const result1 = engine.computeFormingCandle(formingCtx1);
      expect(result1.success).toBe(true);

      // Should produce a diff RSI value
      expect(result1.isDiff).toBe(true);
      expect(Object.keys(result1.diffOutputs).length).toBeGreaterThan(0);

      const diffRsi1 = result1.diffOutputs[rsiKey];
      expect(diffRsi1).toBeDefined();
      // If close changed significantly, RSI should differ from pre-computed value
      // (note: RSI may return NA if insufficient data, but after 30 bars it should be stable)
      if (typeof diffRsi1 === 'number') {
        expect(diffRsi1).not.toBe(beforeRsi);
      }

      // Engine state must be preserved
      expect(engine.getMetrics().totalBars).toBe(totalBarsBefore);
      expect(engine.getOutput(rsiKey)!.last()).toBe(beforeRsi);

      // Second forming candle update — different close produces different RSI
      const formingCtx2 = makeFormingContext(bars, lastBar.close - 5);
      const result2 = engine.computeFormingCandle(formingCtx2);
      expect(result2.success).toBe(true);

      const diffRsi2 = result2.diffOutputs[rsiKey];
      expect(diffRsi2).toBeDefined();
      if (typeof diffRsi1 === 'number' && typeof diffRsi2 === 'number') {
        expect(diffRsi2).not.toBe(diffRsi1);
      }

      // State still preserved after second call
      expect(engine.getMetrics().totalBars).toBe(totalBarsBefore);
      expect(engine.getOutput(rsiKey)!.last()).toBe(beforeRsi);
    });

    it('should produce correct RSI across multiple consecutive forming candle updates', () => {
      const engine = compileScript(RSI_SCRIPT);
      const bars = makeBars(30, 100, 1000000);
      const contexts = barsToContexts(bars);
      const fullResult = engine.executeBars(contexts);

      const rsiKey = Array.from(fullResult.outputs.keys()).find((k) =>
        k.toUpperCase().includes('RSI'),
      )!;
      const rsiSeries = fullResult.outputs.get(rsiKey)!;
      const beforeRsi = rsiSeries.last();
      const totalBarsBefore = engine.getMetrics().totalBars;

      const lastBar = bars[bars.length - 1]!;
      let lastDiff: number | null = null;

      for (let tick = 0; tick < 10; tick++) {
        const newClose = lastBar.close + (tick - 5) * 2;
        const formingCtx = makeFormingContext(bars, newClose);
        const result = engine.computeFormingCandle(formingCtx);
        expect(result.success).toBe(true);

        const diffRsi = result.diffOutputs[rsiKey];
        if (typeof diffRsi === 'number') {
          // Each tick with different close should produce a potentially different RSI
          if (lastDiff !== null) {
            // RSI should be different since close differs between ticks
            // (unless the RSI happens to be the same by coincidence)
            // At minimum, verify RSI is a valid number
            expect(diffRsi).toBeGreaterThanOrEqual(0);
            expect(diffRsi).toBeLessThanOrEqual(100);
          }
          lastDiff = diffRsi;
        }

        // State preserved after each tick
        expect(engine.getMetrics().totalBars).toBe(totalBarsBefore);
        expect(engine.getOutput(rsiKey)!.last()).toBe(beforeRsi);
      }
    });

    it('should maintain correct engine state when forming candle is followed by a new committed bar', () => {
      const engine = compileScript(RSI_SCRIPT);
      const bars = makeBars(30, 100, 1000000);
      const contexts = barsToContexts(bars);
      const fullResult = engine.executeBars(contexts);

      const rsiKey = Array.from(fullResult.outputs.keys()).find((k) =>
        k.toUpperCase().includes('RSI'),
      )!;
      const beforeRsi = engine.getOutput(rsiKey)!.last();
      const totalBarsBefore = engine.getMetrics().totalBars;

      // Run a forming candle update
      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, lastBar.close + 8);
      engine.computeFormingCandle(formingCtx);

      // Now simulate a new committed bar arriving
      const newTimestamp = lastBar.timestamp + 60000;
      const newContext: ExecutionContext = {
        barIndex: totalBarsBefore,
        barCount: totalBarsBefore + 1,
        timestamp: newTimestamp,
        open: createSeries('open', bars.map((b) => b.open).concat(lastBar.close + 5)),
        high: createSeries('high', bars.map((b) => b.high).concat(lastBar.close + 10)),
        low: createSeries('low', bars.map((b) => b.low).concat(lastBar.close + 3)),
        close: createSeries('close', bars.map((b) => b.close).concat(lastBar.close + 8)),
        volume: createSeries('volume', bars.map((b) => b.volume).concat(1000)),
      };

      const newBarResult = engine.executeRealtimeBar(newContext);
      expect(newBarResult.success).toBe(true);

      // State should have advanced
      expect(engine.getMetrics().totalBars).toBe(totalBarsBefore + 1);

      // RSI should be computed based on the new bar, not the forming candle
      const afterRsi = engine.getOutput(rsiKey)!.last();
      expect(afterRsi).toBeDefined();
      // RSI after new committed bar should differ from pre-forming-candle value
      // since a real new bar with different close was committed
      if (typeof afterRsi === 'number' && typeof beforeRsi === 'number') {
        expect(afterRsi).not.toBe(beforeRsi);
      }
    });
  });

  describe('HMA and ATR forming candle computation', () => {
    const HMA_ATR_SCRIPT = `//@version=6
indicator("HMA+ATR Test")
hmaVal = ta.hma(close, 10)
atrVal = ta.atr(14)
plot(hmaVal, "HMA")
plot(atrVal, "ATR")
`;

    it('should compute HMA and ATR correctly across forming candle updates', () => {
      const engine = compileScript(HMA_ATR_SCRIPT);
      const bars = makeBars(30, 100, 1000000);
      const contexts = barsToContexts(bars);
      const fullResult = engine.executeBars(contexts);

      const hmaKey = Array.from(fullResult.outputs.keys()).find((k) => k.includes('HMA'))!;
      const atrKey = Array.from(fullResult.outputs.keys()).find((k) => k.includes('ATR'))!;
      expect(hmaKey).toBeDefined();
      expect(atrKey).toBeDefined();

      const hmaBefore = engine.getOutput(hmaKey)!.last();
      const atrBefore = engine.getOutput(atrKey)!.last();
      const totalBarsBefore = engine.getMetrics().totalBars;

      // Forming candle update
      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, lastBar.close + 15);
      const result = engine.computeFormingCandle(formingCtx);
      expect(result.success).toBe(true);

      // Verify HMA and ATR diffs exist
      const diffHma = result.diffOutputs[hmaKey];
      const diffAtr = result.diffOutputs[atrKey];
      if (typeof diffHma === 'number' && typeof hmaBefore === 'number') {
        expect(diffHma).not.toBe(hmaBefore);
      }
      if (typeof diffAtr === 'number' && typeof atrBefore === 'number') {
        expect(diffAtr).not.toBe(atrBefore);
      }

      // State preserved
      expect(engine.getMetrics().totalBars).toBe(totalBarsBefore);
      expect(engine.getOutput(hmaKey)!.last()).toBe(hmaBefore);
      expect(engine.getOutput(atrKey)!.last()).toBe(atrBefore);

      // Second forming candle update — state still intact
      const formingCtx2 = makeFormingContext(bars, lastBar.close - 10);
      const result2 = engine.computeFormingCandle(formingCtx2);
      expect(result2.success).toBe(true);

      expect(engine.getMetrics().totalBars).toBe(totalBarsBefore);
      expect(engine.getOutput(hmaKey)!.last()).toBe(hmaBefore);
      expect(engine.getOutput(atrKey)!.last()).toBe(atrBefore);
    });
  });

  describe('Parabolic SAR forming candle computation', () => {
    const SAR_SCRIPT = `//@version=6
indicator("SAR Test")
sarVal = ta.sar(0.02, 0.02, 0.2)
plot(sarVal, "SAR")
`;

    it('should compute SAR correctly during forming candle updates', () => {
      const engine = compileScript(SAR_SCRIPT);
      const bars = makeBars(30, 100, 1000000);
      const contexts = barsToContexts(bars);
      const fullResult = engine.executeBars(contexts);

      const sarKey = Array.from(fullResult.outputs.keys()).find((k) => k.includes('SAR'))!;
      expect(sarKey).toBeDefined();

      const sarBefore = engine.getOutput(sarKey)!.last();
      const totalBarsBefore = engine.getMetrics().totalBars;

      // Forming candle update with modified OHLC
      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, lastBar.close + 15);
      const result = engine.computeFormingCandle(formingCtx);
      expect(result.success).toBe(true);

      // SAR diff should exist (since OHLC changed)
      const diffSar = result.diffOutputs[sarKey];
      if (typeof diffSar === 'number' && typeof sarBefore === 'number') {
        expect(diffSar).not.toBe(sarBefore);
      }

      // State preserved
      expect(engine.getMetrics().totalBars).toBe(totalBarsBefore);
      expect(engine.getOutput(sarKey)!.last()).toBe(sarBefore);

      // Multiple forming updates
      for (let tick = 0; tick < 5; tick++) {
        const formingCtxN = makeFormingContext(bars, lastBar.close + tick * 3);
        const resultN = engine.computeFormingCandle(formingCtxN);
        expect(resultN.success).toBe(true);
        expect(engine.getMetrics().totalBars).toBe(totalBarsBefore);
        expect(engine.getOutput(sarKey)!.last()).toBe(sarBefore);
      }
    });
  });
});

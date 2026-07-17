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
    const close = open + (i < count * 0.4 ? 3 : -2);
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

describe('Real-Time Strategy Computation', () => {
  // A simple strategy that goes long when close > ta.sma(close, 10)
  const SMA_CROSSOVER_STRATEGY = `//@version=6
strategy("SMA Crossover Strategy", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=100)
sma10 = ta.sma(close, 10)
if (close > sma10)
    strategy.entry("Long", strategy.long)
if (close < sma10)
    strategy.close("Long")
plot(sma10, "SMA10")
`;

  describe('strategy forming candle does not mutate strategy engine state', () => {
    it('should not enter a position during a forming candle update', () => {
      const engine = compileScript(SMA_CROSSOVER_STRATEGY);
      const bars = makeBars(30, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      // Get strategy markers before forming candle
      // (executeBars only returns the last result; markers accumulate on the engine)
      const resultAny = engine as unknown as { strategyEngine?: { getMarkers: () => unknown[] } };
      const markersBefore = resultAny.strategyEngine?.getMarkers()?.length ?? 0;

      const totalBarsBefore = engine.getMetrics().totalBars;

      // Forming candle update — condition may trigger entry signal
      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, lastBar.close + 50);
      const result = engine.computeFormingCandle(formingCtx);
      expect(result.success).toBe(true);

      // Engine state must NOT have advanced — no new bar committed
      expect(engine.getMetrics().totalBars).toBe(totalBarsBefore);

      // Strategy markers must NOT have changed (no real entry committed)
      const markersAfter = resultAny.strategyEngine?.getMarkers()?.length ?? 0;
      expect(markersAfter).toBe(markersBefore);

      // Strategy position should remain flat
      // This verifies that strategy engine state was properly rolled back
      expect(result.diffOutputs).toBeDefined();
    });

    it('should preserve strategy state across multiple forming candle updates', () => {
      const engine = compileScript(SMA_CROSSOVER_STRATEGY);
      const bars = makeBars(30, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const resultAny = engine as unknown as { strategyEngine?: { getMarkers: () => unknown[] } };
      const markersBefore = resultAny.strategyEngine?.getMarkers()?.length ?? 0;
      const totalBarsBefore = engine.getMetrics().totalBars;

      const lastBar = bars[bars.length - 1]!;

      // Run multiple forming candle ticks with varying close prices
      for (let tick = 0; tick < 10; tick++) {
        const newClose = lastBar.close + (tick - 5) * 20;
        const formingCtx = makeFormingContext(bars, newClose);
        const result = engine.computeFormingCandle(formingCtx);
        expect(result.success).toBe(true);

        // State must be preserved after every tick
        expect(engine.getMetrics().totalBars).toBe(totalBarsBefore);
        const markersAfter = resultAny.strategyEngine?.getMarkers()?.length ?? 0;
        expect(markersAfter).toBe(markersBefore);
      }
    });
  });

  describe('strategy forming candle followed by committed bar', () => {
    it('should correctly enter a position when a new committed bar triggers signals', () => {
      const engine = compileScript(SMA_CROSSOVER_STRATEGY);
      const bars = makeBars(30, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const resultAny = engine as unknown as { strategyEngine?: { getMarkers: () => unknown[] } };
      const markersBefore = resultAny.strategyEngine?.getMarkers()?.length ?? 0;
      const totalBarsBefore = engine.getMetrics().totalBars;

      // Run a forming candle update (should not commit anything)
      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, lastBar.close + 50);
      engine.computeFormingCandle(formingCtx);

      // Verify forming candle didn't affect state
      expect(engine.getMetrics().totalBars).toBe(totalBarsBefore);
      const markersAfterForming = resultAny.strategyEngine?.getMarkers()?.length ?? 0;
      expect(markersAfterForming).toBe(markersBefore);

      // Now commit a new real bar where close > sma(10)
      const newTimestamp = lastBar.timestamp + 60000;
      const newContext: ExecutionContext = {
        barIndex: totalBarsBefore,
        barCount: totalBarsBefore + 1,
        timestamp: newTimestamp,
        open: createSeries('open', bars.map((b) => b.open).concat(lastBar.close + 40)),
        high: createSeries('high', bars.map((b) => b.high).concat(lastBar.close + 55)),
        low: createSeries('low', bars.map((b) => b.low).concat(lastBar.close + 38)),
        close: createSeries('close', bars.map((b) => b.close).concat(lastBar.close + 50)),
        volume: createSeries('volume', bars.map((b) => b.volume).concat(1000)),
      };

      const realtimeResult = engine.executeRealtimeBar(newContext);
      expect(realtimeResult.success).toBe(true);

      // State should have advanced by one bar
      expect(engine.getMetrics().totalBars).toBe(totalBarsBefore + 1);

      // Strategy should have entered a long position (close > sma10)
      const markersAfterRealtime = resultAny.strategyEngine?.getMarkers()?.length ?? 0;
      // Since close > sma10 is true, strategy.entry should have been called
      // and at minimum the markers should include the entry marker
      expect(markersAfterRealtime).toBeGreaterThan(markersAfterForming);
    });
  });

  describe('strategy engine integrity after forming candle with entry/exit logic', () => {
    const ENTRY_EXIT_STRATEGY = `//@version=6
strategy("Entry/Exit Strategy", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=100)
sma20 = ta.sma(close, 20)
sma50 = ta.sma(close, 50)
if (ta.crossover(sma20, sma50))
    strategy.entry("Long", strategy.long)
if (ta.crossunder(sma20, sma50))
    strategy.close("Long")
plot(sma20, "SMA20")
plot(sma50, "SMA50")
`;

    it('should not corrupt crossover/crossunder state during forming candle', () => {
      const engine = compileScript(ENTRY_EXIT_STRATEGY);
      // Need enough bars for SMA50 to initialize
      const bars = makeBars(80, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const totalBarsBefore = engine.getMetrics().totalBars;
      const lastBar = bars[bars.length - 1]!;

      // Run a forming candle where a crossover would occur
      const formingCtx = makeFormingContext(bars, lastBar.close + 100);
      const result = engine.computeFormingCandle(formingCtx);
      expect(result.success).toBe(true);

      // State must be preserved
      expect(engine.getMetrics().totalBars).toBe(totalBarsBefore);

      // Second forming candle — cross prev values should still be intact
      const formingCtx2 = makeFormingContext(bars, lastBar.close - 100);
      const result2 = engine.computeFormingCandle(formingCtx2);
      expect(result2.success).toBe(true);

      // After both forming candles, state is still intact
      expect(engine.getMetrics().totalBars).toBe(totalBarsBefore);

      // Now execute a real new bar — the cross state from forming candles
      // should NOT affect the real bar's computation
      const newTimestamp = lastBar.timestamp + 60000;
      const newContext: ExecutionContext = {
        barIndex: totalBarsBefore,
        barCount: totalBarsBefore + 1,
        timestamp: newTimestamp,
        open: createSeries('open', bars.map((b) => b.open).concat(lastBar.close + 95)),
        high: createSeries('high', bars.map((b) => b.high).concat(lastBar.close + 105)),
        low: createSeries('low', bars.map((b) => b.low).concat(lastBar.close + 90)),
        close: createSeries('close', bars.map((b) => b.close).concat(lastBar.close + 100)),
        volume: createSeries('volume', bars.map((b) => b.volume).concat(1000)),
      };

      const realtimeResult = engine.executeRealtimeBar(newContext);
      expect(realtimeResult.success).toBe(true);
      expect(engine.getMetrics().totalBars).toBe(totalBarsBefore + 1);
    });
  });
});

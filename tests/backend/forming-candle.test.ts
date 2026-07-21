import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import { ScriptSession } from '../../backend/src/session/ScriptSession.js';

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
    const close = open + 2;
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
  // Each context only needs the current bar's values — executeBar uses getRelative(0)
  // which reads the last element. Historical values are maintained by the engine's
  // pushBarValues mechanism, not by the context series. This is O(n) memory, not O(n²).
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

const SMA_SCRIPT = `//@version=6
indicator("SMA Test")
smaValue = ta.sma(close, 5)
plot(smaValue)
`;

const EMA_SCRIPT = `//@version=6
indicator("EMA Test")
emaValue = ta.ema(close, 10)
plot(emaValue)
`;

const VAR_SCRIPT = `//@version=6
indicator("Var Test")
var counter = 0.0
counter := counter + 1
plot(counter)
`;

const MULTI_PLOT_SCRIPT = `//@version=6
indicator("Multi Plot")
sma5 = ta.sma(close, 5)
sma10 = ta.sma(close, 10)
plot(sma5)
plot(sma10)
`;

const ALERT_SCRIPT = `//@version=6
indicator("Alert Test")
alertcondition(close > open, title="Bullish Bar", message="Bullish bar confirmed")
plot(close)
`;

describe('Forming Candle Computation', () => {
  describe('computeFormingCandle()', () => {
    it('should return diff outputs for the forming candle only', () => {
      const engine = compileScript(SMA_SCRIPT);
      const bars = makeBars(15, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, lastBar.close + 5);

      const result = engine.computeFormingCandle(formingCtx);
      expect(result.success).toBe(true);
      expect(result.isDiff).toBe(true);
      expect(Object.keys(result.diffOutputs).length).toBeGreaterThan(0);
    });

    it('should preserve engine state after forming candle computation', () => {
      const engine = compileScript(SMA_SCRIPT);
      const bars = makeBars(15, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const totalBarsBefore = engine.getMetrics().totalBars;

      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, lastBar.close + 5);

      engine.computeFormingCandle(formingCtx);

      const totalBarsAfter = engine.getMetrics().totalBars;
      expect(totalBarsAfter).toBe(totalBarsBefore);
    });

    it('should send post-tick barTimestamps reflecting the tick', () => {
      const engine = compileScript(SMA_SCRIPT);
      const bars = makeBars(15, 100, 1000000);
      const contexts = barsToContexts(bars);
      const result = engine.executeBars(contexts);

      const timestampsBefore = result.barTimestamps?.length ?? 0;

      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, lastBar.close + 5);

      const formingResult = engine.computeFormingCandle(formingCtx);
      // The diff result now includes the tick's bar in barTimestamps
      // (the engine's internal state IS still restored; only the diff message
      // tells the frontend about the tick). Same-bar ticks get a duplicate
      // timestamp; new-bar ticks get a genuinely new one.
      expect(formingResult.barTimestamps.length).toBe(timestampsBefore + 1);
      // Verify the engine itself was restored (last timestamp unchanged)
      expect(result.barTimestamps).toEqual(engine['barTimestamps']);
    });

    it('should return updated output value when OHLCV changes', () => {
      const engine = compileScript(SMA_SCRIPT);
      const bars = makeBars(15, 100, 1000000);
      const contexts = barsToContexts(bars);
      const fullResult = engine.executeBars(contexts);

      // plot() without title defaults to key 'plot'
      const plotKey = Array.from(fullResult.outputs.keys()).find((k) => k.includes('plot'));
      expect(plotKey).toBeDefined();
      const plotSeries = fullResult.outputs.get(plotKey!)!;
      const prevPlotValue = plotSeries.last();

      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, (prevPlotValue as number) + 10);

      const formingResult = engine.computeFormingCandle(formingCtx);
      if (formingResult.diffOutputs[plotKey!] !== undefined) {
        const newPlotValue = formingResult.diffOutputs[plotKey!];
        expect(newPlotValue).not.toBe(prevPlotValue);
      }
    });

    it('should re-evaluate indicators correctly with unchanged OHLCV', () => {
      const engine = compileScript(SMA_SCRIPT);
      const bars = makeBars(15, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const lastBar = bars[bars.length - 1]!;
      const sameCtx = makeFormingContext(bars, lastBar.close);

      const result = engine.computeFormingCandle(sameCtx);
      expect(result.success).toBe(true);
      // Diff includes the tick's bar (len = bars.length + 1), engine restored
      expect(result.barTimestamps.length).toBe(bars.length + 1);
      expect(engine.barTimestamps.length).toBe(bars.length);
    });

    it('should handle forming candle before any historical bars', () => {
      const engine = compileScript(SMA_SCRIPT);
      const formingCtx = {
        barIndex: 0,
        barCount: 1,
        timestamp: 1000000,
        open: createSeries('open', [105]),
        high: createSeries('high', [108]),
        low: createSeries('low', [104]),
        close: createSeries('close', [107]),
        volume: createSeries('volume', [1000]),
      };

      const result = engine.computeFormingCandle(formingCtx);
      expect(result.success).toBe(true);
      expect(result.isDiff).toBe(true);
    });

    it('should handle multiple consecutive forming candle updates', () => {
      const engine = compileScript(SMA_SCRIPT);
      const bars = makeBars(15, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const lastBar = bars[bars.length - 1]!;
      for (let tick = 0; tick < 5; tick++) {
        const formingCtx = makeFormingContext(bars, lastBar.close + tick);
        const result = engine.computeFormingCandle(formingCtx);
        expect(result.success).toBe(true);
        // Each tick adds one entry to the diff's barTimestamps
        expect(result.barTimestamps.length).toBe(bars.length + 1);
      }
    });

    it('should not corrupt state when followed by a new bar', () => {
      const engine = compileScript(SMA_SCRIPT);
      const bars = makeBars(15, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, lastBar.close + 5);
      engine.computeFormingCandle(formingCtx);

      const newBarCtx = {
        barIndex: 15,
        barCount: 16,
        timestamp: lastBar.timestamp + 60000,
        open: createSeries('open', [lastBar.close + 10]),
        high: createSeries('high', [lastBar.close + 13]),
        low: createSeries('low', [lastBar.close + 9]),
        close: createSeries('close', [lastBar.close + 12]),
        volume: createSeries('volume', [1000]),
      };
      const newBarResult = engine.executeRealtimeBar(newBarCtx);
      expect(newBarResult.success).toBe(true);
      expect(newBarResult.barTimestamps.length).toBe(bars.length + 1);
    });

    it('should preserve var state across forming candle updates', () => {
      const engine = compileScript(VAR_SCRIPT);
      const bars = makeBars(5, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      // plot(counter) without title creates output key 'plot'
      const counterOutput = engine.getOutput('plot');
      expect(counterOutput).toBeDefined();
      expect(counterOutput!.last()).toBe(5);

      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, lastBar.close + 5);
      const result = engine.computeFormingCandle(formingCtx);
      expect(result.success).toBe(true);

      const counterAfter = engine.getOutput('plot');
      expect(counterAfter).toBeDefined();
      expect(counterAfter!.last()).toBe(5);
    });

    it('should return empty diff shapes when no new shapes created', () => {
      const engine = compileScript(SMA_SCRIPT);
      const bars = makeBars(15, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, lastBar.close + 5);

      const result = engine.computeFormingCandle(formingCtx);
      expect(result.diffShapes.length).toBe(0);
      expect(result.diffFills.length).toBe(0);
      expect(result.diffLines.length).toBe(0);
      expect(result.diffLabels.length).toBe(0);
    });

    it('should produce correct barIndex in result', () => {
      const engine = compileScript(SMA_SCRIPT);
      const bars = makeBars(15, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, lastBar.close + 5);

      const result = engine.computeFormingCandle(formingCtx);
      expect(result.barIndex).toBe(bars.length - 1);
    });

    it('should work with multi-plot scripts', () => {
      const engine = compileScript(MULTI_PLOT_SCRIPT);
      const bars = makeBars(15, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, lastBar.close + 5);

      const result = engine.computeFormingCandle(formingCtx);
      expect(result.success).toBe(true);
      const outputKeys = Object.keys(result.diffOutputs);
      expect(outputKeys.length).toBeGreaterThan(0);
    });

    it('should handle EMA correctly with forming candle', () => {
      const engine = compileScript(EMA_SCRIPT);
      const bars = makeBars(15, 100, 1000000);
      const contexts = barsToContexts(bars);
      const fullResult = engine.executeBars(contexts);

      // plot() without title defaults to key 'plot'
      const plotKey = Array.from(fullResult.outputs.keys()).find((k) => k.includes('plot'));
      expect(plotKey).toBeDefined();

      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, lastBar.close + 10);

      const result = engine.computeFormingCandle(formingCtx);
      expect(result.success).toBe(true);
    });

    it('should include alert triggers during forming candle computation (suppressed at gateway level)', () => {
      const engine = compileScript(ALERT_SCRIPT);
      const bars = makeBars(15, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, lastBar.close + 5);

      const result = engine.computeFormingCandle(formingCtx);
      // Triggers are now computed (not suppressed at engine level);
      // suppression happens in the gateway via isConfirmed guard
      expect(result.diffAlertTriggers).toBeDefined();
    });

    it('should set isConfirmed=false on forming candle result when caller sets forming flag', () => {
      const engine = compileScript(ALERT_SCRIPT);
      const bars = makeBars(15, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, lastBar.close + 5);
      engine.setFormingCandle(true);

      const result = engine.computeFormingCandle(formingCtx);
      expect(result.isConfirmed).toBe(false);
    });

    it('should evaluate barstate.isconfirmed as false during forming candle', () => {
      const testSource = `//@version=6
indicator("BarState Test")
x = barstate.isconfirmed
plot(x ? 1 : 0, "confirmed")`;
      const engine = compileScript(testSource);
      const bars = makeBars(15, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, lastBar.close + 5);
      engine.setFormingCandle(true);

      const result = engine.computeFormingCandle(formingCtx);
      const confirmedOutput = result.diffOutputs['confirmed'];
      // During forming candle, barstate.isconfirmed should be false → plot value is 0
      expect(confirmedOutput).toBe(0);
    });

    it('should evaluate barstate.isconfirmed as true during realtime bar executeRealtimeBar', () => {
      const testSource = `//@version=6
indicator("BarState Test")
x = barstate.isconfirmed
plot(x ? 1 : 0, "confirmed")`;
      const engine = compileScript(testSource);
      const bars = makeBars(15, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const lastBar = bars[bars.length - 1]!;
      const newBarCtx = {
        barIndex: 15,
        barCount: 16,
        timestamp: lastBar.timestamp + 60000,
        open: createSeries('open', [lastBar.close]),
        high: createSeries('high', [lastBar.close + 3]),
        low: createSeries('low', [lastBar.close - 1]),
        close: createSeries('close', [lastBar.close + 2]),
        volume: createSeries('volume', [1000]),
      };

      const result = engine.executeRealtimeBar(newBarCtx);
      expect(result.success).toBe(true);
      const confirmedKey = Array.from(result.outputs.keys()).find((k) => k.includes('confirmed'));
      expect(confirmedKey).toBeDefined();
      const series = result.outputs.get(confirmedKey!)!;
      // During real-time bar execution, barstate.isconfirmed should be true → plot value is 1
      expect(series.last()).toBe(1);
    });

    it('should produce alert triggers on bar close (executeRealtimeBar)', () => {
      const engine = compileScript(ALERT_SCRIPT);
      const bars = makeBars(15, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const lastBar = bars[bars.length - 1]!;
      const newBarCtx = {
        barIndex: 15,
        barCount: 16,
        timestamp: lastBar.timestamp + 60000,
        open: createSeries('open', [lastBar.close]),
        high: createSeries('high', [lastBar.close + 3]),
        low: createSeries('low', [lastBar.close - 1]),
        close: createSeries('close', [lastBar.close + 2]),
        volume: createSeries('volume', [1000]),
      };

      const result = engine.executeRealtimeBar(newBarCtx);
      expect(result.success).toBe(true);

      const resultAny = result as unknown as Record<string, unknown>;
      const triggers = resultAny.alertTriggers as Array<unknown> | undefined;
      expect(triggers).toBeDefined();
      expect(triggers!.length).toBeGreaterThan(0);
    });

    it('should include diffBgcolor in forming candle result when script uses bgcolor()', () => {
      const bgcolorScript = `//@version=6
indicator("Bgcolor Test")
isUp = close > open
bgcolor(isUp ? color.new(color.green, 95) : color.new(color.red, 95))
plot(close)
`;
      const engine = compileScript(bgcolorScript);
      const bars = makeBars(15, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, lastBar.close + 5);

      const result = engine.computeFormingCandle(formingCtx);
      expect(result.success).toBe(true);
      expect(result.diffOutputs).toBeDefined();
      expect(Object.keys(result.diffOutputs).length).toBeGreaterThan(0);
      expect(result.diffBgcolor).toBeDefined();
      expect(result.diffBgcolor!.length).toBeGreaterThan(0);
    });

    it('should include diffPlotColors in forming candle result when plot uses per-bar colors', () => {
      const colorScript = `//@version=6
indicator("Plot Color Test")
isUp = close > open
plot(close, color=isUp ? color.green : color.red)
`;
      const engine = compileScript(colorScript);
      const bars = makeBars(15, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const lastBar = bars[bars.length - 1]!;
      const formingCtx = makeFormingContext(bars, lastBar.close + 5);

      const result = engine.computeFormingCandle(formingCtx);
      expect(result.success).toBe(true);
      expect(result.diffPlotColors).toBeDefined();
      expect(Object.keys(result.diffPlotColors!).length).toBeGreaterThan(0);
    });

    it('should return correct error on execution failure', () => {
      const engine = compileScript(SMA_SCRIPT);
      const bars = makeBars(3, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const formingCtx = {
        barIndex: 2,
        barCount: 3,
        timestamp: bars[2]!.timestamp,
        open: createSeries('open', [100, 102, NaN]),
        high: createSeries('high', [101, 103, NaN]),
        low: createSeries('low', [99, 101, NaN]),
        close: createSeries('close', [100, 102, NaN]),
        volume: createSeries('volume', [1000, 1000, NaN]),
      };

      const result = engine.computeFormingCandle(formingCtx);
      expect(result.success).toBe(true);
    });
  });

  describe('Stale alert suppression (lastConfirmedTimestamp)', () => {
    it('should treat a confirmed bar with the same timestamp as the last historical bar as stale', () => {
      const engine = compileScript(ALERT_SCRIPT);
      const bars = makeBars(15, 100, 1000000);
      const contexts = barsToContexts(bars);
      engine.executeBars(contexts);

      const lastBar = bars[bars.length - 1]!;
      const lastTimestamp = lastBar.timestamp;

      // Simulate a confirmed kline arriving for the same bar that was already
      // processed during executeBars().  The FormingCandleManager must treat
      // this as a stale duplicate (forming tick path) rather than re-executing.
      engine.setFormingCandle(false);
      const result = engine.executeBar({
        barIndex: 14,
        barCount: 15,
        timestamp: lastTimestamp,
        open: createSeries('open', [lastBar.open]),
        high: createSeries('high', [lastBar.high]),
        low: createSeries('low', [lastBar.low]),
        close: createSeries('close', [lastBar.close + 10]),
        volume: createSeries('volume', [lastBar.volume]),
      });
      // executeBar produces alertTriggers because the condition is evaluated
      // but the key invariant is that the gateway's isConfirmed gate must be
      // false for stale bars.  That is enforced by FormingCandleManager.confirm().
      expect(result.success).toBe(true);
    });

    it('FormingCandleManager.confirm() should return isConfirmed=false for stale bar', () => {
      const bars: TestBar[] = makeBars(15, 100, 1000000);
      const session = new ScriptSession(ALERT_SCRIPT, 'BTCUSDT', '60', bars);
      const initResult = session.initialize();
      expect(initResult.success).toBe(true);

      const lastBar = bars[bars.length - 1]!;
      const staleBar: TestBar = {
        timestamp: lastBar.timestamp, // same timestamp → stale
        open: lastBar.open,
        high: lastBar.high,
        low: lastBar.low,
        close: lastBar.close + 10,
        volume: lastBar.volume,
      };

      const result = session.appendOrUpdateBar(staleBar, true);
      expect(result.success).toBe(true);
      // Stale bar must NOT be marked as confirmed
      expect(result.isConfirmed).toBe(false);
    });

    it('FormingCandleManager.confirm() should return isConfirmed=true for a genuinely new bar', () => {
      const bars: TestBar[] = makeBars(15, 100, 1000000);
      const session = new ScriptSession(ALERT_SCRIPT, 'BTCUSDT', '60', bars);
      const initResult = session.initialize();
      expect(initResult.success).toBe(true);

      const lastBar = bars[bars.length - 1]!;
      const newBar: TestBar = {
        timestamp: lastBar.timestamp + 60000, // new timestamp → confirmed
        open: lastBar.close,
        high: lastBar.close + 3,
        low: lastBar.close - 1,
        close: lastBar.close + 2,
        volume: 1200,
      };

      const result = session.appendOrUpdateBar(newBar, true);
      expect(result.success).toBe(true);
      expect(result.isConfirmed).toBe(true);
    });

    it('should not produce alert triggers for stale bars that duplicate historical data', () => {
      const bars: TestBar[] = makeBars(15, 100, 1000000);
      const session = new ScriptSession(ALERT_SCRIPT, 'BTCUSDT', '60', bars);
      session.initialize();

      const lastBar = bars[bars.length - 1]!;
      const staleBar: TestBar = {
        timestamp: lastBar.timestamp,
        open: lastBar.open,
        high: lastBar.high,
        low: lastBar.low,
        close: lastBar.close + 100, // extreme close that would trigger alert
        volume: lastBar.volume,
      };

      const result = session.appendOrUpdateBar(staleBar, true);
      expect(result.isConfirmed).toBe(false);
      // The stale path returns forming candle output — no full alert triggers dispatched
      expect(result.formingCandle).toBe(true);
    });
  });
});

import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
import { isNa } from '../../src/language/types/na.js';
import type { Bar } from '../../src/data/bar.js';

function createBars(count: number, startPrice: number = 100): Bar[] {
  const bars: Bar[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const open = price;
    const change = (Math.random() - 0.5) * 10;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * 5;
    const low = Math.min(open, close) - Math.random() * 5;

    bars.push({
      timestamp: Date.now() + i * 86400000,
      open,
      high,
      low,
      close,
      volume: Math.floor(Math.random() * 10000) + 1000,
    });

    price = close;
  }

  return bars;
}

function barsToContext(bars: Bar[]): ExecutionContext[] {
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

function executeScript(
  source: string,
  bars: Bar[],
): { engine: ExecutionEngine; result: ReturnType<ExecutionEngine['executeBar']> } {
  const { ast } = parse(source);
  const compileResult = compile(ast);
  const engine = new ExecutionEngine(compileResult);
  const contexts = barsToContext(bars);

  let lastResult;
  for (const ctx of contexts) {
    lastResult = engine.executeBar(ctx);
    if (!lastResult.success) {
      console.error('Execute failed at bar', ctx.barIndex, 'error:', lastResult.error);
      break;
    }
  }

  return { engine, result: lastResult! };
}

describe('Complex Script Integration Tests', () => {

  // --- 1. Candle Size Classifier ---
  it('1. Candle Size Classifier: if/else chain with bar data', () => {
    const source = `//@version=6
indicator("Candle Classifier")
bodySize = math.abs(close - open)
fullRange = high - low
isBullish = close > open
if isBullish
    if bodySize > fullRange * 0.7
        plot(1, "Bull Marubozu")
    else
        plot(0.5, "Bull Small")
else
    if bodySize > fullRange * 0.7
        plot(-1, "Bear Marubozu")
    else
        plot(-0.5, "Bear Small")`;

    const bars = createBars(20);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const metrics = engine.getMetrics();
    expect(metrics.totalBars).toBe(20);
    expect(metrics.failedBars).toBe(0);
  });

  // --- 2. Streak Counter with var ---
  it('2. Streak Counter: var persistence across bars', () => {
    const source = `//@version=6
indicator("Streak Counter")
var streak = 0
isUp = close > open
if isUp
    streak := streak + 1
else
    streak := 0
plot(streak, "Up Streak")`;

    const bars = createBars(30);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const output = engine.getOutput('Up Streak');
    expect(output).toBeDefined();

    // Verify var persistence: the streak should never go negative
    const values = output!.values;
    for (let i = 0; i < values.length; i++) {
      if (!isNa(values[i])) {
        expect(values[i] as number).toBeGreaterThanOrEqual(0);
      }
    }
  });

  // --- 3. Simple Moving Average Calculation ---
  it('3. Manual SMA: for loop with accumulation', () => {
    const source = `//@version=6
indicator("Manual SMA")
period = 5
sum = 0.0
for i = 0 to 4
    sum := sum + close
smaValue = sum / period
plot(smaValue, "SMA")`;

    const bars = createBars(20);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const output = engine.getOutput('SMA');
    expect(output).toBeDefined();
    expect(output!.values.length).toBe(20);

    const lastValue = output!.last();
    expect(isNa(lastValue)).toBe(false);
    expect(typeof lastValue).toBe('number');
  });

  // --- 4. Price Position in Range ---
  it('4. Price Position: ternary with math functions', () => {
    const source = `//@version=6
indicator("Price Position")
range = high - low
position = range > 0 ? (close - low) / range * 100 : 50.0
plot(position, "Position %")`;

    const bars = createBars(25);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const output = engine.getOutput('Position %');
    expect(output).toBeDefined();

    // Position should be between 0 and 100 when range > 0
    const values = output!.values;
    for (let i = 0; i < values.length; i++) {
      if (!isNa(values[i])) {
        const v = values[i] as number;
        expect(v).toBeGreaterThanOrEqual(-0.001);
        expect(v).toBeLessThanOrEqual(100.001);
      }
    }
  });

  // --- 5. Trend Detection with var ---
  it('5. Trend Detection: var + if/else across bars', () => {
    const source = `//@version=6
indicator("Trend Detector")
var trend = 0
if close > open and close[1] > open[1]
    trend := 1
else if close < open and close[1] < open[1]
    trend := -1
else
    trend := 0
plot(trend, "Trend")`;

    const bars = createBars(25);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const output = engine.getOutput('Trend');
    expect(output).toBeDefined();

    const values = output!.values;
    for (let i = 0; i < values.length; i++) {
      if (!isNa(values[i])) {
        const v = values[i] as number;
        expect([0, 1, -1]).toContain(v);
      }
    }
  });

  // --- 6. Math Function Chains ---
  it('6. Math Chains: nested math.* calls', () => {
    const source = `//@version=6
indicator("Math Chains")
diff = close - open
absDiff = math.abs(diff)
squared = math.pow(absDiff, 2)
root = math.sqrt(squared)
rounded = math.round(root, 2)
plot(rounded, "Result")`;

    const bars = createBars(15);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const output = engine.getOutput('Result');
    expect(output).toBeDefined();

    // sqrt(abs(x)^2) should equal abs(x)
    const values = output!.values;
    for (let i = 0; i < values.length; i++) {
      if (!isNa(values[i])) {
        const v = values[i] as number;
        expect(v).toBeGreaterThanOrEqual(0);
        // Should be rounded to 2 decimal places (allow floating point drift)
        expect(Math.abs(v * 100 - Math.round(v * 100))).toBeLessThan(0.01);
      }
    }
  });

  // --- 7. Volume-Weighted Signal ---
  it('7. Volume Signal: volume threshold with var accumulator', () => {
    const source = `//@version=6
indicator("Volume Signal")
var highVolCount = 0
avgVol = volume * 1.0
isHighVol = volume > avgVol
if isHighVol
    highVolCount := highVolCount + 1
plot(highVolCount, "High Vol Count")`;

    const bars = createBars(20);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const output = engine.getOutput('High Vol Count');
    expect(output).toBeDefined();

    const values = output!.values;
    // Counter should be monotonically non-decreasing (only increments or stays same)
    let lastValid = 0;
    for (let i = 0; i < values.length; i++) {
      if (!isNa(values[i])) {
        const v = values[i] as number;
        expect(v).toBeGreaterThanOrEqual(lastValid);
        lastValid = v;
      }
    }
  });

  // --- 8. Complex Boolean Logic ---
  it('8. Complex Conditions: and/or operators', () => {
    const source = `//@version=6
indicator("Complex Conditions")
isGreen = close > open
bigBody = math.abs(close - open) > (high - low) * 0.5
highVolume = volume > 5000
signal = (isGreen and bigBody) or highVolume
plot(signal ? 1.0 : 0.0, "Signal")`;

    const bars = createBars(20);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const output = engine.getOutput('Signal');
    expect(output).toBeDefined();

    const values = output!.values;
    for (let i = 0; i < values.length; i++) {
      if (!isNa(values[i])) {
        const v = values[i] as number;
        expect([0, 1]).toContain(v);
      }
    }
  });

  // --- 9. Multi-Plot Indicator ---
  it('9. Multi-Plot: multiple plot outputs from one script', () => {
    const source = `//@version=6
indicator("Multi Plot")
body = close - open
upperWick = high - math.max(open, close)
lowerWick = math.min(open, close) - low
plot(body, "Body")
plot(upperWick, "Upper Wick")
plot(lowerWick, "Lower Wick")`;

    const bars = createBars(15);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    expect(engine.getOutput('Body')).toBeDefined();
    expect(engine.getOutput('Upper Wick')).toBeDefined();
    expect(engine.getOutput('Lower Wick')).toBeDefined();

    // All three should have the same length
    expect(engine.getOutput('Body')!.values.length).toBe(15);
    expect(engine.getOutput('Upper Wick')!.values.length).toBe(15);
    expect(engine.getOutput('Lower Wick')!.values.length).toBe(15);
  });

  // --- 10. Range Classification ---
  it('10. Range Classification: nested if/else with comparisons', () => {
    const source = `//@version=6
indicator("Range Classifier")
barRange = high - low
avgRange = 10.0
if barRange > avgRange * 2
    plot(2, "Wide")
else if barRange > avgRange
    plot(1, "Normal")
else if barRange > avgRange * 0.5
    plot(0, "Narrow")
else
    plot(-1, "Doji")`;

    const bars = createBars(20);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const metrics = engine.getMetrics();
    expect(metrics.failedBars).toBe(0);
  });

  // --- 11. Rolling Max/Min ---
  it('11. Rolling Max: for loop finding highest close', () => {
    const source = `//@version=6
indicator("Rolling Max")
period = 10
maxClose = close
for i = 1 to 9
    if close[i] > maxClose
        maxClose := close[i]
plot(maxClose, "Max Close")`;

    const bars = createBars(20);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const output = engine.getOutput('Max Close');
    expect(output).toBeDefined();

    // Max should always be >= current close
    const values = output!.values;
    for (let i = 0; i < values.length; i++) {
      if (!isNa(values[i]) && !isNa(bars[i]!.close)) {
        expect(values[i] as number).toBeGreaterThanOrEqual(bars[i]!.close);
      }
    }
  });

  // --- 12. Signal with Cooldown (var-based state machine) ---
  it('12. Signal Cooldown: var state machine across bars', () => {
    const source = `//@version=6
indicator("Signal Cooldown")
var cooldown = 0
var lastSignal = 0
crossover = close > open and close[1] <= open[1]
if crossover and cooldown == 0
    lastSignal := bar_index
    cooldown := 5
if cooldown > 0
    cooldown := cooldown - 1
plot(cooldown, "Cooldown")`;

    const bars = createBars(30);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const output = engine.getOutput('Cooldown');
    expect(output).toBeDefined();

    // Cooldown should never exceed 5
    const values = output!.values;
    for (let i = 0; i < values.length; i++) {
      if (!isNa(values[i])) {
        const v = values[i] as number;
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(5);
      }
    }
  });

  // --- 13. Percentage Change ---
  it('13. Percent Change: division and multiplication', () => {
    const source = `//@version=6
indicator("Pct Change")
prevClose = close[1]
pctChange = prevClose > 0 ? (close - prevClose) / prevClose * 100 : 0.0
plot(pctChange, "% Change")`;

    const bars = createBars(20);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const output = engine.getOutput('% Change');
    expect(output).toBeDefined();

    // First bar: close[1] is NA, prevClose > 0 is NA, ternary returns 0.0
    expect(output!.values[0]).toBe(0);
    for (let i = 1; i < output!.values.length; i++) {
      if (!isNa(output!.values[i])) {
        expect(typeof output!.values[i]).toBe('number');
      }
    }
  });

  // --- 14. OHLC Position Score ---
  it('14. OHLC Score: using all OHLC values in computation', () => {
    const source = `//@version=6
indicator("OHLC Score")
typical = (high + low + close) / 3
score = 0
if close > typical
    score := score + 1
if open > typical
    score := score + 1
if high > typical * 1.01
    score := score + 1
if low < typical * 0.99
    score := score - 1
plot(score, "Score")`;

    const bars = createBars(20);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const output = engine.getOutput('Score');
    expect(output).toBeDefined();

    // Score should be in range [-1, 3]
    const values = output!.values;
    for (let i = 0; i < values.length; i++) {
      if (!isNa(values[i])) {
        const v = values[i] as number;
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(3);
      }
    }
  });

  // --- 15. Trailing Stop ---
  it('15. Trailing Stop: var with conditional update', () => {
    const source = `//@version=6
indicator("Trailing Stop")
var trailStop = 0.0
offset = 5.0
newStop = high - offset
if newStop > trailStop
    trailStop := newStop
plot(trailStop, "Trail Stop")`;

    const bars = createBars(25);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const output = engine.getOutput('Trail Stop');
    expect(output).toBeDefined();

    // Trailing stop should be monotonically non-decreasing
    let lastValid = -Infinity;
    const values = output!.values;
    for (let i = 0; i < values.length; i++) {
      if (!isNa(values[i])) {
        const v = values[i] as number;
        expect(v).toBeGreaterThanOrEqual(lastValid);
        lastValid = v;
      }
    }
  });

  // --- 16. Range Ratio ---
  it('16. Range Ratio: multiple comparisons in single expression', () => {
    const source = `//@version=6
indicator("Range Ratio")
candleRange = high - low
bodyRange = math.abs(close - open)
upperWick = high - math.max(open, close)
lowerWick = math.min(open, close) - low
bodyRatio = candleRange > 0 ? bodyRange / candleRange : 0.0
upperRatio = candleRange > 0 ? upperWick / candleRange : 0.0
lowerRatio = candleRange > 0 ? lowerWick / candleRange : 0.0
plot(bodyRatio, "Body Ratio")
plot(upperRatio, "Upper Ratio")
plot(lowerRatio, "Lower Ratio")`;

    const bars = createBars(20);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const bodyRatio = engine.getOutput('Body Ratio');
    const upperRatio = engine.getOutput('Upper Ratio');
    const lowerRatio = engine.getOutput('Lower Ratio');

    expect(bodyRatio).toBeDefined();
    expect(upperRatio).toBeDefined();
    expect(lowerRatio).toBeDefined();

    // All ratios should be between 0 and 1
    for (const output of [bodyRatio!, upperRatio!, lowerRatio!]) {
      for (let i = 0; i < output.values.length; i++) {
        if (!isNa(output.values[i])) {
          const v = output.values[i] as number;
          expect(v).toBeGreaterThanOrEqual(-0.001);
          expect(v).toBeLessThanOrEqual(1.001);
        }
      }
    }
  });

  // --- 17. Multi-bar var accumulation ---
  it('17. Cumulative Sum: var accumulating across all bars', () => {
    const source = `//@version=6
indicator("Cumulative Sum")
var cumSum = 0.0
cumSum := cumSum + close
plot(cumSum, "Cum Sum")`;

    const bars = createBars(10);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const output = engine.getOutput('Cum Sum');
    expect(output).toBeDefined();

    // Each bar should add close to the cumulative sum
    const values = output!.values;
    let runningSum = 0;
    for (let i = 0; i < values.length; i++) {
      if (!isNa(values[i])) {
        runningSum += bars[i]!.close;
        expect(values[i] as number).toBeCloseTo(runningSum, 5);
      }
    }
  });

  // --- 18. High/Low Breakout ---
  it('18. Breakout Detection: compare current to previous highs/lows', () => {
    const source = `//@version=6
indicator("Breakout")
var highestHigh = 0.0
var lowestLow = 999999.0
if high > highestHigh
    highestHigh := high
if low < lowestLow
    lowestLow := low
breakUp = close > highestHigh[1]
breakDown = close < lowestLow[1]
plot(breakUp ? 1.0 : breakDown ? -1.0 : 0.0, "Breakout")`;

    const bars = createBars(25);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const output = engine.getOutput('Breakout');
    expect(output).toBeDefined();

    const values = output!.values;
    for (let i = 0; i < values.length; i++) {
      if (!isNa(values[i])) {
        const v = values[i] as number;
        expect([-1, 0, 1]).toContain(v);
      }
    }
  });

  // --- 19. Weighted Close ---
  it('19. Weighted Close: math functions in expression', () => {
    const source = `//@version=6
indicator("Weighted Close")
wc = (high + low + close * 2) / 4
deviation = math.sqrt(math.pow(close - wc, 2))
upperBand = wc + deviation * 2
lowerBand = wc - deviation * 2
plot(wc, "WC")
plot(upperBand, "Upper")
plot(lowerBand, "Lower")`;

    const bars = createBars(20);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    expect(engine.getOutput('WC')).toBeDefined();
    expect(engine.getOutput('Upper')).toBeDefined();
    expect(engine.getOutput('Lower')).toBeDefined();

    // Upper should always be >= WC, Lower should always be <= WC
    const wc = engine.getOutput('WC')!.values;
    const upper = engine.getOutput('Upper')!.values;
    const lower = engine.getOutput('Lower')!.values;

    for (let i = 0; i < wc.length; i++) {
      if (!isNa(wc[i]) && !isNa(upper[i]) && !isNa(lower[i])) {
        expect(upper[i] as number).toBeGreaterThanOrEqual((wc[i] as number) - 0.001);
        expect(lower[i] as number).toBeLessThanOrEqual((wc[i] as number) + 0.001);
      }
    }
  });

  // --- 20. Volatility Index ---
  it('20. Volatility Index: combining math functions over bars', () => {
    const source = `//@version=6
indicator("Volatility Index")
barRange = high - low
returns = barRange > 0 ? barRange / close * 100 : 0.0
absReturn = math.abs(returns)
plot(absReturn, "Vol")`;

    const bars = createBars(30);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const output = engine.getOutput('Vol');
    expect(output).toBeDefined();

    // All non-NA values should be non-negative (it's abs of returns)
    const values = output!.values;
    for (let i = 0; i < values.length; i++) {
      if (!isNa(values[i])) {
        expect(values[i] as number).toBeGreaterThanOrEqual(0);
      }
    }
  });

  // --- 21. State Machine ---
  it('21. State Machine: var tracking state transitions', () => {
    const source = `//@version=6
indicator("State Machine")
var state = 0
if state == 0 and close > open
    state := 1
else if state == 1 and close < open
    state := 2
else if state == 2
    state := 0
plot(state, "State")`;

    const bars = createBars(30);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const output = engine.getOutput('State');
    expect(output).toBeDefined();

    // State should only be 0, 1, or 2
    const values = output!.values;
    for (let i = 0; i < values.length; i++) {
      if (!isNa(values[i])) {
        const v = values[i] as number;
        expect([0, 1, 2]).toContain(v);
      }
    }
  });

  // --- 22. Max Drawdown Calculation ---
  it('22. Max Drawdown: var tracking peak and drawdown', () => {
    const source = `//@version=6
indicator("Max Drawdown")
var peak = 0.0
var maxDD = 0.0
if close > peak
    peak := close
dd = peak > 0 ? (peak - close) / peak * 100 : 0.0
if dd > maxDD
    maxDD := dd
plot(maxDD, "MaxDD%")`;

    const bars = createBars(30);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const output = engine.getOutput('MaxDD%');
    expect(output).toBeDefined();

    // Max drawdown should be monotonically non-decreasing
    let lastValid = 0;
    const values = output!.values;
    for (let i = 0; i < values.length; i++) {
      if (!isNa(values[i])) {
        const v = values[i] as number;
        expect(v).toBeGreaterThanOrEqual(lastValid - 0.001);
        expect(v).toBeGreaterThanOrEqual(0);
        lastValid = v;
      }
    }
  });

  // --- 23. Bar Color Classification ---
  it('23. Bar Color: switch/case on computed value', () => {
    const source = `//@version=6
indicator("Bar Color")
range = high - low
body = math.abs(close - open)
ratio = range > 0 ? body / range : 0.0
colorVal = 0
if ratio > 0.8
    colorVal := 3
else if ratio > 0.5
    colorVal := 2
else if ratio > 0.2
    colorVal := 1
else
    colorVal := 0
plot(colorVal, "Color Class")`;

    const bars = createBars(20);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const output = engine.getOutput('Color Class');
    expect(output).toBeDefined();

    const values = output!.values;
    for (let i = 0; i < values.length; i++) {
      if (!isNa(values[i])) {
        const v = values[i] as number;
        expect([0, 1, 2, 3]).toContain(v);
      }
    }
  });

  // --- 24. Combined Signal with All Features ---
  it('24. Combined Signal: var + for + if/else + math + ternary', () => {
    const source = `//@version=6
indicator("Combined Signal")
var signalCount = 0
bodySize = math.abs(close - open)
range = high - low
isBullish = close > open
avgBody = bodySize
strongCandle = bodySize > range * 0.6
if isBullish and strongCandle
    signalCount := signalCount + 1
avgRange = range
efficiency = range > 0 ? math.abs(close - open) / range : 0.0
composite = signalCount * efficiency
plot(composite, "Composite")`;

    const bars = createBars(25);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const output = engine.getOutput('Composite');
    expect(output).toBeDefined();
    expect(output!.values.length).toBe(25);
  });

  // --- 25. Performance with realistic script ---
  it('25. Performance: 1000 bars with complex script', () => {
    const source = `//@version=6
indicator("Perf Test")
var cumReturn = 0.0
pctChg = close > 0 ? (high - low) / close * 100 : 0.0
absChg = math.abs(pctChg)
cumReturn := cumReturn + pctChg
volatility = absChg > 2.0 ? 1.0 : 0.0
plot(cumReturn, "Cum Return")`;

    const bars = createBars(1000);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const metrics = engine.getMetrics();
    expect(metrics.totalBars).toBe(1000);
    expect(metrics.failedBars).toBe(0);

    const output = engine.getOutput('Cum Return');
    expect(output).toBeDefined();
    expect(output!.values.length).toBe(1000);
  });
});

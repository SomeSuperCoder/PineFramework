import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';
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

describe('Strategy Script Integration Tests', () => {

  // --- 1. Full MA Bias + Parabolic SAR Long Only ---
  it('1. MA Bias + Parabolic SAR Long Only', () => {
    const source = `//@version=6
strategy("MA Bias + Parabolic SAR Long Only", overlay=true, initial_capital=10000)

maLength = input.int(200, "MA Length", minval=1)
maType   = input.string("EMA", "MA Type", options=["SMA", "EMA"])

psarStart = input.float(0.02, "PSAR Start", step=0.01)
psarInc   = input.float(0.02, "PSAR Increment", step=0.01)
psarMax   = input.float(0.20, "PSAR Maximum", step=0.01)

ma = switch maType
    "SMA" => ta.sma(close, maLength)
    => ta.ema(close, maLength)

psar = ta.sar(psarStart, psarInc, psarMax)

bullBias = close > ma

psarBullFlip = psar < low and psar[1] > high[1]

longEntry = bullBias and psarBullFlip

if longEntry and strategy.position_size == 0
    strategy.entry("Long", strategy.long)

psarBearFlip = psar > high and psar[1] < low[1]

longExit = psarBearFlip or close < ma

if longExit and strategy.position_size > 0
    strategy.close("Long")

plot(ma, title="Moving Average", linewidth=2)

plot(
     psar,
     title="Parabolic SAR",
     style=plot.style_cross,
     linewidth=2
)

bgcolor(bullBias ? color.new(color.green, 92) : color.new(color.red, 92))`;

    const bars = createBars(250);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const metrics = engine.getMetrics();
    expect(metrics.totalBars).toBe(250);
    expect(metrics.failedBars).toBe(0);

    const outputs = engine.getAllOutputs();
    const outputKeys = Array.from(outputs.keys());
    expect(outputKeys.some(k => k.startsWith('Moving Average'))).toBe(true);
    expect(outputKeys.some(k => k.startsWith('Parabolic SAR'))).toBe(true);
  });

  // --- 2. Simple SMA Crossover Strategy ---
  it('2. SMA Crossover: fast/slow SMA with strategy entry/exit', () => {
    const source = `//@version=6
strategy("SMA Crossover", overlay=true)

fastLen = input.int(10, "Fast Length", minval=2)
slowLen = input.int(30, "Slow Length", minval=5)

fastMA = ta.sma(close, fastLen)
slowMA = ta.sma(close, slowLen)

crossOver = fastMA > slowMA and fastMA[1] <= slowMA[1]
crossUnder = fastMA < slowMA and fastMA[1] >= slowMA[1]

if crossOver and strategy.position_size <= 0
    strategy.entry("Long", strategy.long)

if crossUnder and strategy.position_size >= 0
    strategy.entry("Short", strategy.short)

plot(fastMA, "Fast MA")
plot(slowMA, "Slow MA")`;

    const bars = createBars(100);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const metrics = engine.getMetrics();
    expect(metrics.totalBars).toBe(100);
    expect(metrics.failedBars).toBe(0);

    const outputs = engine.getAllOutputs();
    const outputKeys = Array.from(outputs.keys());
    expect(outputKeys.some(k => k.startsWith('Fast MA'))).toBe(true);
    expect(outputKeys.some(k => k.startsWith('Slow MA'))).toBe(true);
  });

  // --- 3. Switch expression with three cases ---
  it('3. Switch expression: three-case type selection', () => {
    const source = `//@version=6
strategy("Switch Three Cases", overlay=true)

avgType = input.string("SMA", "Type", options=["SMA", "EMA", "WMA"])
length = input.int(14, "Length", minval=2)

avg = switch avgType
    "SMA" => ta.sma(close, length)
    "EMA" => ta.ema(close, length)
    => close

plot(avg, "Average")`;

    const bars = createBars(50);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    expect(engine.getMetrics().failedBars).toBe(0);
    const outputs = engine.getAllOutputs();
    expect(Array.from(outputs.keys()).some(k => k.startsWith('Average'))).toBe(true);
  });

  // --- 4. PSAR standalone calculation ---
  it('4. Parabolic SAR: standalone calculation with default params', () => {
    const source = `//@version=6
indicator("PSAR Test")

psar = ta.sar(0.02, 0.02, 0.20)

plot(psar, "PSAR")`;

    const bars = createBars(50);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    expect(engine.getMetrics().failedBars).toBe(0);
    const outputs = engine.getAllOutputs();
    expect(Array.from(outputs.keys()).some(k => k.startsWith('PSAR'))).toBe(true);
  });

  // --- 5. Strategy with pyramiding and take-profit ---
  it('5. Pyramiding strategy: multiple entries with take-profit', () => {
    const source = `//@version=6
strategy("Pyramiding Test", pyramiding=3, initial_capital=10000)

entrySig = close > open and close[1] <= open[1]

if entrySig and strategy.position_size < 100
    strategy.entry("Buy", strategy.long, qty=1)

if strategy.position_size > 0 and close > strategy.position_avg_price * 1.02
    strategy.close("Buy")

plot(strategy.position_size, "Position Size")`;

    const bars = createBars(100);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    expect(engine.getMetrics().failedBars).toBe(0);
    const outputs = engine.getAllOutputs();
    expect(Array.from(outputs.keys()).some(k => k.startsWith('Position Size'))).toBe(true);
  });

  // --- 6. Color.new and bgcolor ---
  it('6. Color and bgcolor: background coloring with color.new', () => {
    const source = `//@version=6
indicator("Color Test")

bull = close > open
bgcolor(bull ? color.new(color.green, 90) : color.new(color.red, 90))
plot(close, "Close")`;

    const bars = createBars(30);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    expect(engine.getMetrics().failedBars).toBe(0);
    expect(Array.from(engine.getAllOutputs().keys()).some(k => k.startsWith('Close'))).toBe(true);
  });

  // --- 7. plot.style_cross with linewidth ---
  it('7. Plot style: style parameter with plot.style_cross', () => {
    const source = `//@version=6
indicator("Style Test")

plot(close, "Close", style=plot.style_cross, linewidth=3)`;

    const bars = createBars(20);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    expect(engine.getMetrics().failedBars).toBe(0);
    const outputs = engine.getAllOutputs();
    expect(Array.from(outputs.keys()).some(k => k.startsWith('Close'))).toBe(true);
  });

  // --- 8. Switch expression with numeric cases ---
  it('8. Switch numeric: switch on numeric value', () => {
    const source = `//@version=6
indicator("Numeric Switch")

val = close > open ? 1 : close < open ? -1 : 0
result = switch val
    1 => close * 1.1
    -1 => close * 0.9
    => close
plot(result, "Result")`;

    const bars = createBars(30);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    expect(engine.getMetrics().failedBars).toBe(0);
    expect(Array.from(engine.getAllOutputs().keys()).some(k => k.startsWith('Result'))).toBe(true);
  });

  // --- 9. High bar count with full strategy ---
  it('9. Performance: 500 bars with full strategy', () => {
    const source = `//@version=6
strategy("Perf Strategy", overlay=true, initial_capital=10000)

fastMA = ta.sma(close, 10)
slowMA = ta.sma(close, 30)

longCond = fastMA > slowMA and strategy.position_size <= 0
shortCond = fastMA < slowMA and strategy.position_size >= 0

if longCond
    strategy.entry("Long", strategy.long)
if shortCond
    strategy.entry("Short", strategy.short)

if strategy.position_size > 0 and close < strategy.position_avg_price * 0.98
    strategy.close("Long")
if strategy.position_size < 0 and close > strategy.position_avg_price * 1.02
    strategy.close("Short")

plot(fastMA, "Fast")
plot(slowMA, "Slow")`;

    const bars = createBars(500);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    const metrics = engine.getMetrics();
    expect(metrics.totalBars).toBe(500);
    expect(metrics.failedBars).toBe(0);
  });

  // --- 10. Switch expression with boolean conditions ---
  it('10. Switch boolean: switch on boolean expression', () => {
    const source = `//@version=6
indicator("Boolean Switch")

trend = close > ta.sma(close, 20)
result = switch trend
    true => high
    => low
plot(result, "Result")`;

    const bars = createBars(50);
    const { engine, result } = executeScript(source, bars);

    expect(result.success).toBe(true);
    expect(engine.getMetrics().failedBars).toBe(0);
    expect(Array.from(engine.getAllOutputs().keys()).some(k => k.startsWith('Result'))).toBe(true);
  });
});

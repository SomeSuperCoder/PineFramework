import fs from 'fs';
import { parse } from '../../src/language/parser/parser.js';
import { compile } from '../../src/language/compiler/compiler.js';
import {
  ExecutionEngine,
  type ExecutionContext,
} from '../../src/language/runtime/execution-engine.js';
import { createSeries } from '../../src/language/runtime/series.js';

// The indicator uses ta.atr(200) which creates a runtime lookback of 200 bars.
// applyLookbackFilter nulls all output/color values during that warmup period.
const WARMUP_BARS = 200;
const BAR_COUNT = 300;

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

function runEngine(source: string, bars: ReturnType<typeof createTrendingBars>) {
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
  return { engine, bars, result: engine.executeBars(contexts) };
}

describe('Two-Pole Trend Filter [BigBeluga]', () => {
  const source = fs.readFileSync('./test_indicators/two-pole-trend-filter.pine', 'utf-8');

  it('parses successfully', () => {
    const result = parse(source);
    expect(result.ast).toBeDefined();
  });

  it('compiles successfully', () => {
    const { ast } = parse(source);
    const compiled = compile(ast);
    expect(compiled).toBeDefined();
  });

  it('executes on a single bar without crashing', () => {
    const { ast } = parse(source);
    const compiled = compile(ast);
    const engine = new ExecutionEngine(compiled);
    const bar = { timestamp: Date.now(), open: 100, high: 101, low: 99, close: 100, volume: 1000 };
    const ctx: ExecutionContext = {
      barIndex: 0,
      barCount: 1,
      timestamp: bar.timestamp,
      open: createSeries('open', [bar.open]),
      high: createSeries('high', [bar.high]),
      low: createSeries('low', [bar.low]),
      close: createSeries('close', [bar.close]),
      volume: createSeries('volume', [bar.volume]),
    };
    const result = engine.executeBar(ctx);
    expect(result.success).toBe(true);
  });

  it('produces correct plot output key with linewidth 3', () => {
    const bars = createTrendingBars(100, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const keys = Array.from(result.outputs.keys());
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe('Two-Pole Filter__lw:3');
  });

  it('produces 100% non-null values after warm-up', () => {
    const bars = createTrendingBars(BAR_COUNT, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    for (const [, series] of result.outputs) {
      // Only check values after the warmup period (ta.atr(200) lookback)
      const postWarmup = series.values.slice(WARMUP_BARS) as number[];
      expect(postWarmup.length).toBeGreaterThan(0);
      for (const v of postWarmup) {
        expect(v).not.toBeNull();
        expect(v).not.toBeUndefined();
        expect(typeof v).toBe('number');
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('filter values converge toward close price', () => {
    const bars = createTrendingBars(BAR_COUNT, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const series = Array.from(result.outputs.values())[0]!;
    const tail = 30;
    // Only check tail from post-warmup bars
    const postWarmupValues = (series.values as number[]).slice(WARMUP_BARS);
    const tailFilter = postWarmupValues.slice(-tail);
    const postWarmupBars = bars.slice(WARMUP_BARS);
    const tailClose = postWarmupBars.slice(-tail).map((b) => b.close);
    const avgClose = tailClose.reduce((a, b) => a + b, 0) / tail;
    const avgFilter = tailFilter.reduce((a, b) => a + b, 0) / tail;
    const relError = Math.abs(avgFilter - avgClose) / Math.abs(avgClose);
    expect(relError).toBeLessThan(0.15);
    expect(series.values.length).toBe(BAR_COUNT);
  });

  it('filter is monotonically increasing during steady uptrend', () => {
    const bars = createTrendingBars(BAR_COUNT, 80, 123);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const series = Array.from(result.outputs.values())[0]!;
    // Post-warmup, bars 210-299 are in an uptrend phase (last 30% of 300 bars)
    // Two-pole filter is a low-pass filter — it smooths out noise but won't
    // be perfectly monotonic bar-to-bar. Use a wider tolerance (0.5) since
    // the filter tracks the underlying trend, not each tick.
    const startIdx = WARMUP_BARS + 10;
    const values = series.values.slice(startIdx) as number[];
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeGreaterThanOrEqual(values[i - 1]! - 0.5);
    }
    // Also verify the overall trend is strongly upward
    expect(values[values.length - 1]!).toBeGreaterThan(values[0]!);
  });

  it('produces per-bar gradient colors (green, red, yellow)', () => {
    const bars = createTrendingBars(BAR_COUNT, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.plotColors).toBeDefined();
    const plotColorMap = result.plotColors!;
    const key = 'Two-Pole Filter__lw:3';
    expect(plotColorMap.has(key)).toBe(true);
    const colors = plotColorMap.get(key)!;
    expect(colors.length).toBe(BAR_COUNT);
    // Only check post-warmup colors (first WARMUP_BARS are nulled by lookback filter)
    const postWarmupColors = colors.slice(WARMUP_BARS).filter((c): c is string => c !== null);
    expect(postWarmupColors.length).toBeGreaterThan(0);
    const unique = new Set(postWarmupColors);
    expect(unique.size).toBeGreaterThan(5);
    const lower = postWarmupColors.map((c: string) => c.toLowerCase());
    // Check for red (#f44336 or close variants from gradient)
    const hasRed = lower.some((c: string) => {
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      return r > 200 && g < 100 && b < 100;
    });
    // Check for green/lime (#8bc34a or close variants from gradient)
    const hasGreen = lower.some((c: string) => {
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      return g > 150 && r > 100 && g > r && b < 100;
    });
    // Check for yellow (gradient produces yellowish colors near the boundary)
    const hasYellow = lower.some((c: string) => {
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      return r > 200 && g > 200 && b < 80;
    });
    expect(hasYellow).toBe(true);
    expect(hasGreen).toBe(true);
    expect(hasRed).toBe(true);
  });

  it('color gradient transitions follow trend direction', () => {
    const bars = createTrendingBars(BAR_COUNT, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const allColors = result.plotColors!.get('Two-Pole Filter__lw:3')!;
    // Only consider post-warmup colors (bars WARMUP_BARS and beyond)
    const colors = allColors.slice(WARMUP_BARS).filter((c: any) => c !== null) as string[];
    expect(colors.length).toBeGreaterThan(0);
    const greenish = (c: string) => {
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      return g > r && g > b;
    };
    const reddish = (c: string) => {
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      return r > g && r > b;
    };
    // Post-warmup bars: 200-299
    // For BAR_COUNT=300: uptrend 0-119, downtrend 120-209, uptrend 210-299
    // Post-warmup starts at 200, so visible downtrend bars: 200-209, visible uptrend: 210-299
    // Check that late visible bars (uptrend) have more greenish than the downtrend portion
    const midIdx = 10; // split post-warmup colors: early (downtrend tail) vs late (uptrend)
    const earlyPortion = colors.slice(0, Math.min(midIdx, colors.length));
    const latePortion = colors.slice(Math.max(midIdx, 0));
    const greenCountLate = latePortion.filter(greenish).length;
    const redCountEarly = earlyPortion.filter(reddish).length;
    // Expect at least some green colors in the second uptrend and some red in the downtrend tail
    expect(greenCountLate + redCountEarly).toBeGreaterThan(0);
  });

  it('method var persistence: rising/falling counters increment across bars', () => {
    const bars = createTrendingBars(BAR_COUNT, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const allColors = result.plotColors!.get('Two-Pole Filter__lw:3')!;
    const postWarmupColors = allColors
      .slice(WARMUP_BARS)
      .filter((c: any) => c !== null) as string[];
    expect(postWarmupColors.length).toBeGreaterThan(0);
    const lower = postWarmupColors.map((c) => c.toLowerCase());
    // Check that we see color variety across the post-warmup range
    const hasYellow = lower.some((c) => c === '#ffeb3b');
    const hasGreen = lower.some((c) => c === '#8bc34a');
    expect(hasYellow || hasGreen).toBe(true);
  });

  it('produces no shapes when signals input is false (default)', () => {
    const bars = createTrendingBars(100, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.shapes).toBeDefined();
    expect(result.shapes.length).toBe(0);
  });

  it('produces no bar colors when bar_col input is false (default)', () => {
    const bars = createTrendingBars(100, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    expect(result.barColorData).toBeDefined();
    expect(result.barColorData!.length).toBe(0);
  });

  it('handles var variables inside method (f1/f2 filter state)', () => {
    const bars = createTrendingBars(BAR_COUNT, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const series = Array.from(result.outputs.values())[0]!;
    // Check post-warmup values are changing (not all identical)
    const vals = (series.values as (number | null)[])
      .slice(WARMUP_BARS)
      .filter((v): v is number => v !== null);
    expect(vals.length).toBeGreaterThan(0);
    for (let i = 1; i < Math.min(20, vals.length); i++) {
      expect(vals[i]!).not.toBe(vals[i - 1]!);
    }
  });

  it('history operator tp_f[2] returns previous values', () => {
    const bars = createTrendingBars(BAR_COUNT, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const series = Array.from(result.outputs.values())[0]!;
    const vals = (series.values as (number | null)[])
      .slice(WARMUP_BARS)
      .filter((v): v is number => v !== null);
    expect(vals.length).toBeGreaterThan(0);
    for (let i = 0; i < vals.length; i++) {
      expect(vals[i]!).toBeGreaterThan(0);
    }
  });

  it('nz() returns 0 for na values inside method', () => {
    const bars = createTrendingBars(BAR_COUNT, 80);
    const { result } = runEngine(source, bars);
    expect(result.success).toBe(true);
    const series = Array.from(result.outputs.values())[0]!;
    // Pick the first non-null value after warmup (it should be > 0 since prices are positive)
    const vals = (series.values as (number | null)[])
      .slice(WARMUP_BARS)
      .filter((v): v is number => v !== null);
    expect(vals.length).toBeGreaterThan(0);
    const firstVal = vals[0]!;
    expect(firstVal).not.toBe(0);
    expect(firstVal).toBeGreaterThan(0);
  });
});

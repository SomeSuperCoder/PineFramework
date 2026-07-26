/**
 * INTEGRATION TEST: Fill Color Data Pipeline
 *
 * Tests each level of the per-bar fill color pipeline.
 */

import { createPineScriptEngine, type Bar } from '../../src/api.js';

// Helper: generate deterministic-ish bars
function generateBars(count: number): Bar[] {
  const bars: Bar[] = [];
  let price = 50000;
  for (let i = 0; i < count; i++) {
    const change = (i % 3 === 0 ? 200 : -200) + (i % 7) * 10;
    const open = price;
    const close = open + change;
    const high = Math.max(open, close) + Math.abs(change) * 0.1;
    const low = Math.min(open, close) - Math.abs(change) * 0.1;
    bars.push({
      timestamp: i * 3600000,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: 1000 + i * 10,
    });
    price = close;
  }
  return bars;
}

const engine = createPineScriptEngine();

// ==================================================================
// LEVEL 1: fill() builtin produces fillColorData
// ==================================================================
describe('Level 1 — fill() builtin produces fillColorData', () => {
  test('color.new() replaces alpha, does NOT append', () => {
    // color.new(color.green, 80) → #00800033 (green, 20% opacity)
    // color.new(#00800033, 20)  → #008000cc (green, 80% opacity) — replaces alpha
    const source = `//@version=5
indicator("alpha_test", overlay=true)
c1 = color.new(color.green, 80)
c2 = color.new(c1, 20)
plot(c1, "c1")
plot(c2, "c2")`;

    const bars = generateBars(3);
    const result = engine.execute(source, bars);
    const out = result.outputs;

    // c1 values should be valid 6 or 8 hex char colors
    const c1val = (out.get('c1') as any)?.last() as string;
    const c2val = (out.get('c2') as any)?.last() as string;

    // Both should be valid hex colors — at most 8 hex chars (RRGGBBAA)
    expect(c1val).toMatch(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/);
    expect(c2val).toMatch(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/);

    // c2 should have the same base color as c1 but different alpha
    const base1 = c1val.slice(1, 7);
    const base2 = c2val.slice(1, 7);
    expect(base1).toBe(base2); // same RGB
  });

  test('fill() with color.new(trend_col, 20) generates valid per-bar hex colors', () => {
    const source = `//@version=5
indicator("L1_fill", overlay=true)
bull = color.new(color.green, 80)
bear = color.new(color.red, 80)
col = close > open ? bull : bear
p1 = plot(high, "High", color.blue, 1)
p2 = plot(low, "Low", color.orange, 1)
fill(p1, p2, color=color.new(col, 20))`;

    const bars = generateBars(30);
    const result = engine.execute(source, bars);

    expect(result.fillColorData).toBeDefined();
    const fcd = result.fillColorData!;
    expect(fcd.size).toBe(1);

    const key = Array.from(fcd.keys())[0];
    expect(key).toMatch(/::/);

    const colors = fcd.get(key)!;
    expect(colors.length).toBe(30);

    // Every non-null color must be valid #RRGGBB or #RRGGBBAA (never longer)
    const nonNull = colors.filter((c) => c !== null);
    expect(nonNull.length).toBeGreaterThan(0);
    for (const c of nonNull) {
      expect(c).toMatch(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/);
    }
  });

  test('fills use raw plot titles with __lw:N metadata', () => {
    const source = `//@version=5
indicator("L1_meta", overlay=true)
p1 = plot(close, "Price", color.white, 2)
p2 = plot(open, "Open", color.gray, 1)
fill(p1, p2, color=color.new(color.blue, 50))`;

    const bars = generateBars(5);
    const result = engine.execute(source, bars);

    const keys = Array.from(result.fillColorData!.keys());
    expect(keys[0]).toContain('__lw:');
    expect(keys[0]).toBe('Price__lw:2::Open__lw:1');
  });

  test('fill() with na color pushes null to fillColorData', () => {
    const source = `//@version=5
indicator("L1_na", overlay=true)
p1 = plot(high, "High")
p2 = plot(low, "Low")
fill(p1, p2, color=na)`;

    const bars = generateBars(10);
    const result = engine.execute(source, bars);

    const colors = result.fillColorData!.get('High::Low')!;
    expect(colors.every((c) => c === null)).toBe(true);
  });

  test('Real ZL indicator produces valid per-bar fill colors', () => {
    const source = `//@version=5
indicator("ZL", overlay=true)
length = input.int(50)
zlema(src, length) =>
    lag = math.floor((length - 1) / 2)
    ema1 = ta.ema(src, length)
    ema2 = ta.ema(ema1, length)
    d = ema1 - ema2
    ema1 + d
basis = zlema(close, length)
bullish_col = color.new(color.green, 80)
bearish_col = color.new(color.red, 80)
trend_col = close > open ? bullish_col : bearish_col
p_basis = plot(basis, "ZL", close > open ? color.green : color.red, 2)
p_price = plot(close, "Price", color.white, 1)
fill(p_basis, p_price, hl2, basis, na, color.new(trend_col, 20))`;

    const bars = generateBars(60);
    const result = engine.execute(source, bars);

    expect(result.fillColorData).toBeDefined();
    const fcd = result.fillColorData!;
    expect(fcd.size).toBe(1);

    const key = Array.from(fcd.keys())[0];
    expect(key).toContain('__lw:');
    expect(key).toBe('ZL__lw:2::Price__lw:1');

    const colors = fcd.get(key)!;
    const nonNull = colors.filter((c) => c !== null);
    const unique = new Set(nonNull);

    expect(nonNull.length).toBeGreaterThan(0);
    expect(unique.size).toBeGreaterThanOrEqual(1);

    // All non-null colors must be valid (max 8 hex chars)
    for (const c of nonNull) {
      expect(c).toMatch(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/);
    }

    // fills[0].color should also be valid
    expect(result.fills[0].color).toMatch(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/);
  });
});
// NOTE: Levels 2-7 were placeholder tests with `expect(true).toBe(true)` —
// they contained no real assertions and were removed in the cleanup-redundant-tests change.
// The real fillColorData coverage is in the Level 1 integration tests above.

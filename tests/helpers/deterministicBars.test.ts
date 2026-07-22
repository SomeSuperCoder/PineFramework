import { describe, it, expect } from 'vitest';
import { createTrendBars, SeededRandom } from './deterministicBars.js';

describe('SeededRandom', () => {
  it('produces identical sequences for the same seed', () => {
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('produces different sequences for different seeds', () => {
    const rng1 = new SeededRandom(42);
    const rng2 = new SeededRandom(99);
    let same = true;
    for (let i = 0; i < 10; i++) {
      if (rng1.next() !== rng2.next()) {
        same = false;
        break;
      }
    }
    expect(same).toBe(false);
  });
});

describe('createTrendBars', () => {
  it('produces identical arrays for the same seed and count', () => {
    const a = createTrendBars({ count: 500, seed: 42, trend: 'sine-wave' });
    const b = createTrendBars({ count: 500, seed: 42, trend: 'sine-wave' });
    expect(a).toEqual(b);
  });

  it('produces different arrays for different seeds', () => {
    const a = createTrendBars({ count: 100, seed: 42 });
    const b = createTrendBars({ count: 100, seed: 99 });
    // At least one bar should differ
    const same = a.every((bar, i) => bar.close === b[i]!.close);
    expect(same).toBe(false);
  });

  it('returns the requested number of bars', () => {
    const bars = createTrendBars({ count: 200, seed: 1, trend: 'linear-up' });
    expect(bars.length).toBe(200);
  });

  it('produces bars with valid OHLCV structure', () => {
    const bars = createTrendBars({ count: 50, seed: 7 });
    for (const bar of bars) {
      expect(bar.high).toBeGreaterThanOrEqual(bar.low);
      expect(bar.high).toBeGreaterThanOrEqual(bar.open);
      expect(bar.high).toBeGreaterThanOrEqual(bar.close);
      expect(bar.low).toBeLessThanOrEqual(bar.open);
      expect(bar.low).toBeLessThanOrEqual(bar.close);
      expect(bar.volume).toBeGreaterThan(0);
      expect(bar.timestamp).toBeGreaterThan(0);
    }
  });

  it('produces increasing timestamps', () => {
    const bars = createTrendBars({ count: 100 });
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i]!.timestamp).toBeGreaterThan(bars[i - 1]!.timestamp);
    }
  });
});

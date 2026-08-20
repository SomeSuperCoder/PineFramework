import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { botActivity, equitySeries, heroSeries } from './demo-data';
import { BotBarChart, EquityAreaChart, HeroAreaChart } from './landing-charts';

/**
 * demo-data determinism (landing v2 — DESIGN §2.2/§2.4/§2.5):
 * the synthetic chart series are generated ONCE at module load from a fixed
 * seeded PRNG (mulberry32). Every visit and every test must see identical
 * data — no Math.random at render, no drift between sessions.
 *
 * Determinism is proven two ways:
 *   1. A pinned snapshot of the mulberry32 output — if randomness crept in,
 *      the snapshot would flake across runs.
 *   2. A Math.random spy around chart renders — the series must be consumed
 *      without ANY call to Math.random at render time.
 */

const HERO_SNAPSHOT = [
  100.3, 100.5, 102.3, 101.9, 103.1, 104.3, 104.7, 105.5, 106.7, 107.3, 109, 109, 110.2,
  110.6, 111.3, 112.4,
];

const EQUITY_SNAPSHOT = [
  100.6, 100.6, 100.7, 102.4, 103.5, 103, 104.5, 104.8, 107.4, 107.1, 107.3, 108, 109.6,
  111.4, 111.9, 112.9, 112.5, 114.8, 114.2, 115.8, 117.2, 116.2, 118.7, 118.7,
];

describe('demo-data (landing v2 deterministic series)', () => {
  it('hero series: 16 weekly points, pinned +12.4% end (matches stat tile)', () => {
    expect(heroSeries).toHaveLength(16);
    expect(heroSeries[0].step).toBe('W1');
    expect(heroSeries[15].step).toBe('W16');
    expect(heroSeries[15].value).toBe(112.4);
    expect(heroSeries.every((p) => Number.isFinite(p.value))).toBe(true);
  });

  it('equity series: 24 monthly points, pinned +18.7% end (matches stat tile)', () => {
    expect(equitySeries).toHaveLength(24);
    expect(equitySeries[0].step).toBe('M1');
    expect(equitySeries[23].step).toBe('M24');
    expect(equitySeries[23].value).toBe(118.7);
    expect(equitySeries.every((p) => Number.isFinite(p.value))).toBe(true);
  });

  it('bot activity: 12 hourly bars, non-negative integer trade counts', () => {
    expect(botActivity).toHaveLength(12);
    expect(botActivity[0].step).toBe('01:00');
    expect(botActivity[11].step).toBe('12:00');
    expect(botActivity.every((p) => Number.isInteger(p.value) && p.value >= 0)).toBe(true);
  });

  it('matches the pinned seed snapshot (regression lock on the mulberry32 output)', () => {
    expect(heroSeries.map((p) => p.value)).toEqual(HERO_SNAPSHOT);
    expect(equitySeries.map((p) => p.value)).toEqual(EQUITY_SNAPSHOT);
    expect(botActivity.map((p) => p.value)).toEqual([1, 2, 2, 1, 2, 2, 3, 1, 0, 4, 3, 0]);
  });

  it('chart renders consume NO Math.random — series come from module-level constants', () => {
    const randomSpy = vi.spyOn(Math, 'random');
    try {
      render(<HeroAreaChart />);
      render(<EquityAreaChart />);
      render(<BotBarChart />);
      expect(randomSpy).not.toHaveBeenCalled();
    } finally {
      randomSpy.mockRestore();
    }
  });
});
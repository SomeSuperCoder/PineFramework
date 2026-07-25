import { describe, it, expect } from 'vitest';
import {
  SAFE_AMOUNT_OF_CANDLES,
  candlesPerDay,
  maxSafeDays,
  estimateBars,
  sliderBounds,
} from './candleLimit';

describe('SAFE_AMOUNT_OF_CANDLES', () => {
  it('should be 1500', () => {
    expect(SAFE_AMOUNT_OF_CANDLES).toBe(1500);
  });
});

describe('candlesPerDay', () => {
  it('should return 1440 for 1m timeframe', () => {
    expect(candlesPerDay('1')).toBe(1440);
  });

  it('should return 288 for 5m timeframe', () => {
    expect(candlesPerDay('5')).toBe(288);
  });

  it('should return 96 for 15m timeframe', () => {
    expect(candlesPerDay('15')).toBe(96);
  });

  it('should return 48 for 30m timeframe', () => {
    expect(candlesPerDay('30')).toBe(48);
  });

  it('should return 24 for 1h timeframe', () => {
    expect(candlesPerDay('60')).toBe(24);
  });

  it('should return 6 for 4h timeframe', () => {
    expect(candlesPerDay('240')).toBe(6);
  });

  it('should return 1 for daily timeframe', () => {
    expect(candlesPerDay('D')).toBe(1);
  });

  it('should return ~0.14 for weekly timeframe', () => {
    expect(candlesPerDay('W')).toBeCloseTo(1 / 7, 5);
  });

  it('should fall back to 24 bars/day for an unknown timeframe', () => {
    expect(candlesPerDay('XYZ')).toBe(24);
  });

  it('should handle compound timeframes like 3M', () => {
    // 3 months in minutes from parseTimeframe
    const result = candlesPerDay('3M');
    expect(result).toBeGreaterThan(0);
    expect(Number.isFinite(result)).toBe(true);
  });
});

describe('maxSafeDays', () => {
  it('should return 1 for 1m timeframe (1440 candles/day → 1500/1440 = 1.04 → 1)', () => {
    expect(maxSafeDays('1')).toBe(1);
  });

  it('should return 62 for 1h timeframe (24 candles/day → 1500/24 = 62.5 → 62)', () => {
    expect(maxSafeDays('60')).toBe(62);
  });

  it('should return 250 for 4h timeframe (6 candles/day → 1500/6 = 250)', () => {
    expect(maxSafeDays('240')).toBe(250);
  });

  it('should return 1500 for daily timeframe (1 candle/day)', () => {
    expect(maxSafeDays('D')).toBe(1500);
  });

  it('should return ~10714 for weekly timeframe (~0.14 candles/day)', () => {
    const result = maxSafeDays('W');
    // 1500 / (1/7) = 10500, floored
    expect(result).toBe(10500);
  });
});

describe('estimateBars', () => {
  it('should estimate bars for 1h timeframe over 10 days', () => {
    expect(estimateBars('60', 10)).toBe(240); // 24 * 10
  });

  it('should estimate bars for daily timeframe over 5 days', () => {
    expect(estimateBars('D', 5)).toBe(5); // 1 * 5
  });

  it('should ceil the result', () => {
    // For 5m: 288 candles/day * 0.5 days = 144 → already integer
    // For 1h: 24 candles/day * 0.1 days = 2.4 → 3
    expect(estimateBars('60', 0.1)).toBe(3); // ceil(2.4)
  });
});

describe('sliderBounds', () => {
  it('should return min=1, max=62 for 1h timeframe', () => {
    const bounds = sliderBounds('60');
    expect(bounds.max).toBe(62);
    expect(bounds.min).toBe(Math.max(1, Math.ceil(0.3 * 62))); // ~19
  });

  it('should return min=ceil(0.3*max), max=maxSafeDays for daily timeframe', () => {
    const bounds = sliderBounds('D');
    expect(bounds.max).toBe(1500);
    expect(bounds.min).toBe(Math.ceil(0.3 * 1500));
  });

  it('should ensure min is at least 1', () => {
    // For 1m: max = 1, 30% = 0.3, ceil(0.3) = 1, max(1, 1) = 1
    const bounds = sliderBounds('1');
    expect(bounds.min).toBe(1);
    expect(bounds.max).toBe(1);
  });

  it('should return valid bounds for 4h timeframe', () => {
    const bounds = sliderBounds('240');
    expect(bounds.max).toBe(250);
    expect(bounds.min).toBeGreaterThanOrEqual(1);
    expect(bounds.min).toBeLessThanOrEqual(bounds.max);
  });
});

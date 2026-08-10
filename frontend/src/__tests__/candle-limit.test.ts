import { describe, it, expect } from 'vitest';
import {
  SAFE_AMOUNT_OF_CANDLES,
  estimateBars,
  sliderBounds,
  validateDateRange,
} from '../utils/candleLimit';

/** Format a Date as YYYY-MM-DD in UTC — the same convention validateDateRange parses. */
function toUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Local YYYY-MM-DD for today — the same string validateDateRange compares "future" against. */
function localToday(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(
    t.getDate(),
  ).padStart(2, '0')}`;
}

describe('SAFE_AMOUNT_OF_CANDLES', () => {
  it('should be 1500', () => {
    expect(SAFE_AMOUNT_OF_CANDLES).toBe(1500);
  });
});

describe('validateDateRange', () => {
  it('accepts a valid past range and reports estimatedBars > 0', () => {
    const end = new Date(Date.now() - 2 * 86_400_000);
    const start = new Date(end.getTime() - 5 * 86_400_000);
    const result = validateDateRange(toUtcDate(start), toUtcDate(end), '60');
    expect(result).toEqual({ valid: true, estimatedBars: 120 }); // 24 candles/day × 5 days
  });

  it('rejects a missing start date', () => {
    const result = validateDateRange('', '2024-01-01', '60');
    expect(result).toEqual({ valid: false, message: 'Select both a start and an end date.' });
  });

  it('rejects a missing end date', () => {
    const result = validateDateRange('2024-01-01', '', '60');
    expect(result).toEqual({ valid: false, message: 'Select both a start and an end date.' });
  });

  it('rejects an unparseable date', () => {
    const result = validateDateRange('not-a-date', '2024-01-01', '60');
    expect(result).toEqual({ valid: false, message: 'Select both a start and an end date.' });
  });

  it('rejects a start date after the end date', () => {
    const result = validateDateRange('2024-01-10', '2024-01-01', '60');
    expect(result).toEqual({
      valid: false,
      message: 'Start date must be on or before the end date.',
    });
  });

  it('rejects an end date in the future', () => {
    const todayStr = localToday();
    const tomorrow = toUtcDate(new Date(Date.parse(`${todayStr}T00:00:00Z`) + 86_400_000));
    const result = validateDateRange('2020-01-01', tomorrow, '60');
    expect(result).toEqual({ valid: false, message: 'End date cannot be in the future.' });
  });

  it('rejects a range that does not span at least 1 day', () => {
    const result = validateDateRange('2024-01-01', '2024-01-01', '60');
    expect(result).toEqual({ valid: false, message: 'The range must span at least 1 day.' });
  });

  it('rejects a range that would load more than SAFE_AMOUNT_OF_CANDLES candles', () => {
    const result = validateDateRange('2000-01-01', '2020-01-01', '1');
    expect(result).toMatchObject({
      valid: false,
      message: expect.stringContaining('more than 1500 candles'),
    });
  });

  it('rejects a date before the Unix epoch', () => {
    const result = validateDateRange('1960-01-01', '1961-01-01', 'D');
    expect(result).toMatchObject({
      valid: false,
      message: expect.stringContaining('Date out of range'),
    });
  });
});

describe('estimateBars', () => {
  it('is positive for positive days', () => {
    expect(estimateBars('60', 10)).toBe(240);
    expect(estimateBars('1', 1)).toBe(1440);
  });

  it('is 0 for 0 days', () => {
    expect(estimateBars('60', 0)).toBe(0);
    expect(estimateBars('D', 0)).toBe(0);
  });
});

describe('sliderBounds', () => {
  it('returns positive integer min/max with min <= max for each timeframe', () => {
    for (const tf of ['1', '5', '60', '240', 'D']) {
      const b = sliderBounds(tf);
      expect(Number.isInteger(b.min)).toBe(true);
      expect(Number.isInteger(b.max)).toBe(true);
      expect(b.min).toBeGreaterThanOrEqual(1);
      expect(b.min).toBeLessThanOrEqual(b.max);
    }
  });

  it('allows fewer days for finer timeframes (coarser timeframe has larger max)', () => {
    expect(sliderBounds('1').max).toBeLessThan(sliderBounds('60').max);
    expect(sliderBounds('60').max).toBeLessThan(sliderBounds('D').max);
  });

  it('returns expected bounds for known timeframes', () => {
    expect(sliderBounds('1')).toEqual({ min: 1, max: 1 });
    expect(sliderBounds('60')).toEqual({ min: 19, max: 62 });
    expect(sliderBounds('D')).toEqual({ min: 450, max: 1500 });
  });
});

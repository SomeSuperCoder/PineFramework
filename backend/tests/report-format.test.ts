import { describe, it, expect } from 'vitest';
import {
  formatMoney,
  formatRate,
  formatProfitFactor,
  formatGeneratedAt,
} from '../src/telegram/report/format.js';

describe('formatMoney', () => {
  it('formats positive values with + sign, thousands separators and 2 decimals', () => {
    expect(formatMoney(12483.2)).toBe('+$12,483.20');
  });

  it('formats negative values with - sign (plain ASCII, not typographic minus)', () => {
    expect(formatMoney(-310.75)).toBe('-$310.75');
  });

  it('formats zero as $0.00 with NO sign', () => {
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('normalizes a tiny negative to $0.00 (no -$0.00)', () => {
    expect(formatMoney(-0.001)).toBe('$0.00');
  });

  it('groups five-digit and six-digit magnitudes', () => {
    expect(formatMoney(12345.67)).toBe('+$12,345.67');
    expect(formatMoney(1234567.89)).toBe('+$1,234,567.89');
  });

  it('rounds to 2 decimals through round2', () => {
    expect(formatMoney(1.005)).toBe('+$1.01');
    expect(formatMoney(0.5)).toBe('+$0.50');
  });
});

describe('formatRate', () => {
  it('formats a fractional win rate to 1 decimal percent', () => {
    expect(formatRate(0.684)).toBe('68.4%');
  });

  it('drops a trailing .0', () => {
    expect(formatRate(0.7)).toBe('70%');
    expect(formatRate(1)).toBe('100%');
  });

  it('handles zero and a bare fraction', () => {
    expect(formatRate(0)).toBe('0%');
    expect(formatRate(0.5)).toBe('50%');
  });
});

describe('formatProfitFactor', () => {
  it('renders the MAX_SAFE_INTEGER sentinel as the infinity glyph', () => {
    expect(formatProfitFactor(Number.MAX_SAFE_INTEGER)).toBe('∞');
  });

  it('formats a finite profit factor to 2 decimals', () => {
    expect(formatProfitFactor(1.87)).toBe('1.87');
    expect(formatProfitFactor(2)).toBe('2.00');
  });

  it('formats zero as 0.00', () => {
    expect(formatProfitFactor(0)).toBe('0.00');
  });
});

describe('formatGeneratedAt', () => {
  it('formats a UTC epoch as a deterministic stamp with the middot separator', () => {
    // 2026-08-07T14:32:00Z
    const ts = Date.UTC(2026, 7, 7, 14, 32);
    expect(formatGeneratedAt(ts)).toBe('Aug 7, 2026 · 14:32 UTC');
  });

  it('pads single-digit hours and minutes', () => {
    const ts = Date.UTC(2026, 0, 5, 0, 5);
    expect(formatGeneratedAt(ts)).toBe('Jan 5, 2026 · 00:05 UTC');
  });

  it('uses a stable month name via UTC fields (not local time)', () => {
    const ts = Date.UTC(2026, 11, 31, 23, 59);
    expect(formatGeneratedAt(ts)).toBe('Dec 31, 2026 · 23:59 UTC');
  });

  it('localizes the month name to Spanish when lang=es (fixed timestamp)', () => {
    const ts = Date.UTC(2026, 7, 7, 14, 32); // 2026-08-07T14:32:00Z -> 'ago'
    expect(formatGeneratedAt(ts, 'es')).toBe('ago 7, 2026 · 14:32 UTC');
  });

  it('localizes the month name to Russian when lang=ru (fixed timestamp)', () => {
    const ts = Date.UTC(2026, 7, 7, 14, 32); // 2026-08-07T14:32:00Z -> 'авг'
    expect(formatGeneratedAt(ts, 'ru')).toBe('авг 7, 2026 · 14:32 UTC');
  });

  it('defaults to en month names when no lang is passed (back-compat)', () => {
    const ts = Date.UTC(2026, 7, 7, 14, 32);
    expect(formatGeneratedAt(ts)).toBe('Aug 7, 2026 · 14:32 UTC');
    expect(formatGeneratedAt(ts, 'en')).toBe('Aug 7, 2026 · 14:32 UTC');
  });
});
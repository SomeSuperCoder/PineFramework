import { rejectIfUnreasonable } from '../src/ws/gateway.js';
import type { Bar } from 'pine-framework';

function makeBar(overrides: Partial<Bar> = {}): Bar {
  return {
    timestamp: 1712246400000,
    open: 50000,
    high: 50500,
    low: 49500,
    close: 50200,
    volume: 1000,
    ...overrides,
  };
}

describe('rejectIfUnreasonable', () => {
  it('accepts a normal bar', () => {
    expect(rejectIfUnreasonable(makeBar())).toBeNull();
  });

  it('rejects bar with high < low', () => {
    expect(rejectIfUnreasonable(makeBar({ high: 49000, low: 51000 }))).toMatch('high < low');
  });

  it('rejects bar with open outside high-low range', () => {
    expect(rejectIfUnreasonable(makeBar({ open: 60000 }))).toMatch('open outside');
  });

  it('rejects bar with close outside high-low range', () => {
    expect(rejectIfUnreasonable(makeBar({ close: 60000 }))).toMatch('close outside');
  });

  it('rejects bar with zero price', () => {
    expect(rejectIfUnreasonable(makeBar({ open: 0 }))).toMatch('zero or negative');
  });

  it('rejects bar with negative price', () => {
    expect(rejectIfUnreasonable(makeBar({ close: -1 }))).toMatch('zero or negative');
  });

  it('rejects bar with non-finite price', () => {
    expect(rejectIfUnreasonable(makeBar({ open: NaN }))).toMatch('non-finite');
    expect(rejectIfUnreasonable(makeBar({ high: Infinity }))).toMatch('non-finite');
  });

  it('rejects bar with close delta > 50% from previous close', () => {
    const prevBar = makeBar({ close: 50000, high: 51000 });
    const bar = makeBar({ close: 80000, high: 81000, low: 49000 });
    expect(rejectIfUnreasonable(bar, prevBar)).toMatch('close Δ');
  });

  it('accepts bar with close delta <= 50% from previous close', () => {
    const prevBar = makeBar({ close: 50000, high: 51000 });
    const bar = makeBar({ close: 60000, high: 61000, low: 49000 });
    expect(rejectIfUnreasonable(bar, prevBar)).toBeNull();
  });

  it('passes when no prevBar is provided regardless of absolute price', () => {
    // Without a prevBar, the delta check is skipped, only structural checks apply
    const bar = makeBar({ open: 950000, high: 1000000, low: 900000, close: 999999 });
    expect(rejectIfUnreasonable(bar)).toBeNull();
  });
});

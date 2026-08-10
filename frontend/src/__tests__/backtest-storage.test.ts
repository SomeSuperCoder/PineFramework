import { beforeEach, describe, it, expect } from 'vitest';
import {
  BACKTEST_SETTINGS_KEY,
  DEFAULT_BACKTEST_SETTINGS,
  loadBacktestSettings,
  saveBacktestSettings,
  type BacktestSettings,
} from '../utils/backtestStorage';

beforeEach(() => {
  localStorage.clear();
});

describe('loadBacktestSettings', () => {
  it('returns the defaults when localStorage is empty', () => {
    expect(loadBacktestSettings()).toEqual(DEFAULT_BACKTEST_SETTINGS);
  });

  it('returns defaults when the stored value is garbage JSON (does not throw)', () => {
    localStorage.setItem(BACKTEST_SETTINGS_KEY, '{this is not json');
    expect(() => loadBacktestSettings()).not.toThrow();
    expect(loadBacktestSettings()).toEqual(DEFAULT_BACKTEST_SETTINGS);
  });

  it('clamps an out-of-range daysBack into [1, max] for the effective timeframe', () => {
    localStorage.setItem(BACKTEST_SETTINGS_KEY, JSON.stringify({ daysBack: 999999, timeframe: '60' }));
    const loaded = loadBacktestSettings();
    expect(loaded.daysBack).toBe(62); // maxSafeDays('60')
    expect(loaded.daysBack).toBeGreaterThanOrEqual(1);
  });

  it('drops a non-numeric daysBack and falls back to the default', () => {
    localStorage.setItem(BACKTEST_SETTINGS_KEY, JSON.stringify({ daysBack: 'abc' }));
    expect(loadBacktestSettings().daysBack).toBe(DEFAULT_BACKTEST_SETTINGS.daysBack);
  });

  it('drops a non-positive daysBack and falls back to the default', () => {
    localStorage.setItem(BACKTEST_SETTINGS_KEY, JSON.stringify({ daysBack: -5 }));
    expect(loadBacktestSettings().daysBack).toBe(DEFAULT_BACKTEST_SETTINGS.daysBack);
  });
});

describe('saveBacktestSettings', () => {
  it('round-trips settings through localStorage', () => {
    const settings: BacktestSettings = {
      initialCapital: 5000,
      timeframe: 'D',
      symbol: 'ETHUSDT',
      dateRangeMode: 'traditional',
      daysBack: 10,
      startDate: '2024-01-01',
      endDate: '2024-01-10',
      commissionMethod: 'jupiter_ultra',
      commissionMethodSettings: null,
    };
    saveBacktestSettings(settings);
    expect(loadBacktestSettings()).toEqual(settings);
  });

  it('persists the settings under BACKTEST_SETTINGS_KEY', () => {
    const settings: BacktestSettings = { ...DEFAULT_BACKTEST_SETTINGS, initialCapital: 12345 };
    saveBacktestSettings(settings);
    const raw = localStorage.getItem(BACKTEST_SETTINGS_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual(settings);
  });
});

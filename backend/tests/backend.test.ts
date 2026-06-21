import { OHLCVCache } from '../src/cache/ohlcv-cache.js';
import type { Bar } from 'pine-framework';
import { createPineScriptEngine } from 'pine-framework';

function makeBar(overrides: Partial<Bar> = {}): Bar {
  return {
    timestamp: Date.now(),
    open: 100,
    high: 105,
    low: 95,
    close: 102,
    volume: 1000,
    ...overrides,
  };
}

describe('OHLCVCache', () => {
  let cache: OHLCVCache;

  beforeEach(() => {
    cache = new OHLCVCache(3, 60_000);
  });

  it('stores and retrieves data', () => {
    const bars = [makeBar(), makeBar({ close: 103 })];
    cache.set('BTCUSDT', '1m', bars);
    const result = cache.get('BTCUSDT', '1m');
    expect(result).toEqual(bars);
  });

  it('returns null for missing keys', () => {
    expect(cache.get('ETHUSDT', '5m')).toBeNull();
  });

  it('evicts oldest entry when full', () => {
    cache.set('A', '1m', [makeBar()]);
    cache.set('B', '1m', [makeBar()]);
    cache.set('C', '1m', [makeBar()]);
    cache.set('D', '1m', [makeBar()]);
    expect(cache.size()).toBe(3);
    expect(cache.get('A', '1m')).toBeNull();
  });

  it('invalidates entries', () => {
    cache.set('BTCUSDT', '1m', [makeBar()]);
    cache.invalidate('BTCUSDT', '1m');
    expect(cache.get('BTCUSDT', '1m')).toBeNull();
  });

  it('clears all entries', () => {
    cache.set('A', '1m', [makeBar()]);
    cache.set('B', '5m', [makeBar()]);
    cache.clear();
    expect(cache.size()).toBe(0);
  });
});

describe('Pine Script Execution via engine', () => {
  it('executes a simple script without throwing', () => {
    const engine = createPineScriptEngine();
    const bars = Array.from({ length: 50 }, (_, i) =>
      makeBar({ timestamp: Date.now() + i * 60000, close: 100 + Math.sin(i) * 10 })
    );
    const result = engine.execute(
      `//@version=6
indicator("Test")
plot(close)`,
      bars
    );
    expect(result.success).toBe(true);
  });

  it('throws on invalid scripts', () => {
    const engine = createPineScriptEngine();
    const bars = [makeBar()];
    expect(() => {
      engine.execute('this is not valid pine code', bars);
    }).toThrow();
  });
});

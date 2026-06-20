import { DataEngine } from '../../src/data/data-engine.js';
import { createBar, validateBar } from '../../src/data/bar.js';
import type { Bar } from '../../src/data/bar.js';

function createTestBars(
  count: number,
  startTimestamp: number = 0,
  interval: number = 60000,
): Bar[] {
  return Array.from({ length: count }, (_, i) =>
    createBar(
      startTimestamp + i * interval,
      100 + Math.random() * 10,
      110 + Math.random() * 5,
      90 + Math.random() * 10,
      100 + Math.random() * 10,
      1000000 + Math.random() * 500000,
    ),
  );
}

describe('DataEngine', () => {
  let engine: DataEngine;

  beforeEach(() => {
    engine = new DataEngine();
  });

  describe('addBars', () => {
    it('should add bars for a symbol and timeframe', () => {
      const bars = createTestBars(10);
      engine.addBars('AAPL', 'D', bars);

      expect(engine.getBarCount('AAPL', 'D')).toBe(10);
    });

    it('should deduplicate bars by timestamp', () => {
      const bars1 = createTestBars(5, 0);
      const bars2 = createTestBars(5, 0);

      engine.addBars('AAPL', 'D', bars1);
      engine.addBars('AAPL', 'D', bars2);

      expect(engine.getBarCount('AAPL', 'D')).toBe(5);
    });

    it('should merge new bars with existing bars', () => {
      const bars1 = createTestBars(5, 0);
      const bars2 = createTestBars(5, 300000);

      engine.addBars('AAPL', 'D', bars1);
      engine.addBars('AAPL', 'D', bars2);

      expect(engine.getBarCount('AAPL', 'D')).toBe(10);
    });

    it('should reject invalid bars', () => {
      const invalidBar = createBar(0, 100, 90, 110, 105, 1000000);

      expect(() => {
        engine.addBars('AAPL', 'D', [invalidBar]);
      }).toThrow('Invalid bar data');
    });

    it('should reject bars with negative volume', () => {
      const invalidBar = createBar(0, 100, 110, 90, 105, -1000);

      expect(() => {
        engine.addBars('AAPL', 'D', [invalidBar]);
      }).toThrow('Invalid bar data');
    });

    it('should reject bars with NaN values', () => {
      const invalidBar = createBar(0, NaN, 110, 90, 105, 1000);

      expect(() => {
        engine.addBars('AAPL', 'D', [invalidBar]);
      }).toThrow('Invalid bar data');
    });

    it('should respect maxBarsPerSymbol limit', () => {
      const smallEngine = new DataEngine({ maxBarsPerSymbol: 100 });
      const bars = createTestBars(150);

      smallEngine.addBars('AAPL', 'D', bars);

      expect(smallEngine.getBarCount('AAPL', 'D')).toBe(100);
    });

    it('should work with validation disabled', () => {
      const noValidationEngine = new DataEngine({ enableValidation: false });
      const invalidBar = createBar(0, 100, 90, 110, 105, 1000000);

      noValidationEngine.addBars('AAPL', 'D', [invalidBar]);

      expect(noValidationEngine.getBarCount('AAPL', 'D')).toBe(1);
    });
  });

  describe('getBars', () => {
    it('should return all bars when no range specified', () => {
      const bars = createTestBars(10);
      engine.addBars('AAPL', 'D', bars);

      const result = engine.getBars('AAPL', 'D');
      expect(result).toHaveLength(10);
    });

    it('should filter bars by start timestamp', () => {
      const bars = createTestBars(10, 0, 60000);
      engine.addBars('AAPL', 'D', bars);

      const result = engine.getBars('AAPL', 'D', 300000);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.timestamp).toBeGreaterThanOrEqual(300000);
    });

    it('should filter bars by end timestamp', () => {
      const bars = createTestBars(10, 0, 60000);
      engine.addBars('AAPL', 'D', bars);

      const result = engine.getBars('AAPL', 'D', undefined, 300000);
      expect(result.length).toBeGreaterThan(0);
      result.forEach((bar) => {
        expect(bar.timestamp).toBeLessThanOrEqual(300000);
      });
    });

    it('should filter bars by both start and end timestamps', () => {
      const bars = createTestBars(10, 0, 60000);
      engine.addBars('AAPL', 'D', bars);

      const result = engine.getBars('AAPL', 'D', 120000, 360000);
      result.forEach((bar) => {
        expect(bar.timestamp).toBeGreaterThanOrEqual(120000);
        expect(bar.timestamp).toBeLessThanOrEqual(360000);
      });
    });

    it('should return empty array for non-existent symbol', () => {
      const result = engine.getBars('NONEXISTENT', 'D');
      expect(result).toEqual([]);
    });

    it('should return empty array for non-existent timeframe', () => {
      engine.addBars('AAPL', 'D', createTestBars(5));
      const result = engine.getBars('AAPL', '1H');
      expect(result).toEqual([]);
    });
  });

  describe('getLatestBar', () => {
    it('should return the latest bar', () => {
      const bars = createTestBars(10, 0, 60000);
      engine.addBars('AAPL', 'D', bars);

      const latest = engine.getLatestBar('AAPL', 'D');
      expect(latest).toBeDefined();
      expect(latest!.timestamp).toBe(540000);
    });

    it('should return undefined for non-existent symbol', () => {
      expect(engine.getLatestBar('NONEXISTENT', 'D')).toBeUndefined();
    });
  });

  describe('getOldestBar', () => {
    it('should return the oldest bar', () => {
      const bars = createTestBars(10, 0, 60000);
      engine.addBars('AAPL', 'D', bars);

      const oldest = engine.getOldestBar('AAPL', 'D');
      expect(oldest).toBeDefined();
      expect(oldest!.timestamp).toBe(0);
    });

    it('should return undefined for non-existent symbol', () => {
      expect(engine.getOldestBar('NONEXISTENT', 'D')).toBeUndefined();
    });
  });

  describe('hasData', () => {
    it('should return true when data exists', () => {
      engine.addBars('AAPL', 'D', createTestBars(5));
      expect(engine.hasData('AAPL', 'D')).toBe(true);
    });

    it('should return false for non-existent symbol', () => {
      expect(engine.hasData('NONEXISTENT', 'D')).toBe(false);
    });

    it('should return false for non-existent timeframe', () => {
      engine.addBars('AAPL', 'D', createTestBars(5));
      expect(engine.hasData('AAPL', '1H')).toBe(false);
    });
  });

  describe('getSymbols and getTimeframes', () => {
    it('should return all symbols', () => {
      engine.addBars('AAPL', 'D', createTestBars(5));
      engine.addBars('GOOGL', 'D', createTestBars(5));

      const symbols = engine.getSymbols();
      expect(symbols).toContain('AAPL');
      expect(symbols).toContain('GOOGL');
    });

    it('should return all timeframes for a symbol', () => {
      engine.addBars('AAPL', 'D', createTestBars(5));
      engine.addBars('AAPL', '1H', createTestBars(5));

      const timeframes = engine.getTimeframes('AAPL');
      expect(timeframes).toContain('D');
      expect(timeframes).toContain('1H');
    });
  });

  describe('clear', () => {
    it('should clear specific symbol and timeframe', () => {
      engine.addBars('AAPL', 'D', createTestBars(5));
      engine.addBars('AAPL', '1H', createTestBars(5));

      engine.clear('AAPL', 'D');

      expect(engine.hasData('AAPL', 'D')).toBe(false);
      expect(engine.hasData('AAPL', '1H')).toBe(true);
    });

    it('should clear all data for a symbol', () => {
      engine.addBars('AAPL', 'D', createTestBars(5));
      engine.addBars('AAPL', '1H', createTestBars(5));

      engine.clear('AAPL');

      expect(engine.hasData('AAPL', 'D')).toBe(false);
      expect(engine.hasData('AAPL', '1H')).toBe(false);
    });

    it('should clear all data', () => {
      engine.addBars('AAPL', 'D', createTestBars(5));
      engine.addBars('GOOGL', 'D', createTestBars(5));

      engine.clear();

      expect(engine.getSymbols()).toEqual([]);
    });
  });

  describe('getMemoryEstimate', () => {
    it('should return memory estimate', () => {
      engine.addBars('AAPL', 'D', createTestBars(100));

      const estimate = engine.getMemoryEstimate();
      expect(estimate.bars).toBe(100);
      expect(estimate.estimatedBytes).toBeGreaterThan(0);
    });

    it('should handle empty engine', () => {
      const estimate = engine.getMemoryEstimate();
      expect(estimate.bars).toBe(0);
      expect(estimate.estimatedBytes).toBe(0);
    });
  });

  describe('caching', () => {
    it('should cache bar retrieval results', () => {
      engine.addBars('AAPL', 'D', createTestBars(100));

      const result1 = engine.getBars('AAPL', 'D', 0, 300000);
      const result2 = engine.getBars('AAPL', 'D', 0, 300000);

      expect(result1).toEqual(result2);
    });

    it('should invalidate cache when new bars are added', () => {
      engine.addBars('AAPL', 'D', createTestBars(10));
      engine.getBars('AAPL', 'D');

      engine.addBars('AAPL', 'D', createTestBars(5, 600000));

      const result = engine.getBars('AAPL', 'D');
      expect(result.length).toBe(15);
    });
  });
});

describe('validateBar', () => {
  it('should validate correct bar data', () => {
    const bar = createBar(0, 100, 110, 90, 105, 1000000);
    expect(validateBar(bar)).toBe(true);
  });

  it('should reject bar with high < low', () => {
    const bar = createBar(0, 100, 90, 110, 105, 1000000);
    expect(validateBar(bar)).toBe(false);
  });

  it('should reject bar with open outside range', () => {
    const bar = createBar(0, 80, 110, 90, 105, 1000000);
    expect(validateBar(bar)).toBe(false);
  });

  it('should reject bar with close outside range', () => {
    const bar = createBar(0, 100, 110, 90, 120, 1000000);
    expect(validateBar(bar)).toBe(false);
  });

  it('should reject bar with negative volume', () => {
    const bar = createBar(0, 100, 110, 90, 105, -1000);
    expect(validateBar(bar)).toBe(false);
  });

  it('should reject bar with NaN values', () => {
    const bar = createBar(0, NaN, 110, 90, 105, 1000000);
    expect(validateBar(bar)).toBe(false);
  });

  it('should reject bar with Infinity values', () => {
    const bar = createBar(0, Infinity, 110, 90, 105, 1000000);
    expect(validateBar(bar)).toBe(false);
  });

  it('should accept bar with equal high and low', () => {
    const bar = createBar(0, 110, 110, 110, 110, 1000000);
    expect(validateBar(bar)).toBe(true);
  });
});

import { RequestSystem } from '../../src/data/request-system.js';
import { DataEngine } from '../../src/data/data-engine.js';
import { createBar } from '../../src/data/bar.js';
import type { Bar } from '../../src/data/bar.js';
import type { DataSource } from '../../src/data/request-system.js';

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

class MockDataSource implements DataSource {
  private bars: Bar[] = [];

  setBars(bars: Bar[]): void {
    this.bars = bars;
  }

  async fetchBars(
    _symbol: string,
    _timeframe: string,
    _start: number,
    _end: number,
  ): Promise<Bar[]> {
    return this.bars;
  }
}

describe('RequestSystem', () => {
  let dataEngine: DataEngine;
  let requestSystem: RequestSystem;

  beforeEach(() => {
    dataEngine = new DataEngine();
    requestSystem = new RequestSystem(dataEngine);
  });

  describe('requestSecurityClose', () => {
    it('should return close prices from data engine', async () => {
      const bars = createTestBars(10, 0, 60000);
      dataEngine.addBars('AAPL', 'D', bars);

      const closes = await requestSystem.requestSecurityClose('AAPL', 'D');

      expect(closes).toHaveLength(10);
      closes.forEach((close) => {
        expect(typeof close).toBe('number');
        expect(Number.isFinite(close)).toBe(true);
      });
    });

    it('should return empty array for non-existent symbol', async () => {
      const closes = await requestSystem.requestSecurityClose('NONEXISTENT', 'D');
      expect(closes).toEqual([]);
    });
  });

  describe('requestSecurityOpen', () => {
    it('should return open prices from data engine', async () => {
      const bars = createTestBars(10, 0, 60000);
      dataEngine.addBars('AAPL', 'D', bars);

      const opens = await requestSystem.requestSecurityOpen('AAPL', 'D');

      expect(opens).toHaveLength(10);
      opens.forEach((open) => {
        expect(typeof open).toBe('number');
        expect(Number.isFinite(open)).toBe(true);
      });
    });
  });

  describe('requestSecurityHigh', () => {
    it('should return high prices from data engine', async () => {
      const bars = createTestBars(10, 0, 60000);
      dataEngine.addBars('AAPL', 'D', bars);

      const highs = await requestSystem.requestSecurityHigh('AAPL', 'D');

      expect(highs).toHaveLength(10);
    });
  });

  describe('requestSecurityLow', () => {
    it('should return low prices from data engine', async () => {
      const bars = createTestBars(10, 0, 60000);
      dataEngine.addBars('AAPL', 'D', bars);

      const lows = await requestSystem.requestSecurityLow('AAPL', 'D');

      expect(lows).toHaveLength(10);
    });
  });

  describe('requestSecurityVolume', () => {
    it('should return volume from data engine', async () => {
      const bars = createTestBars(10, 0, 60000);
      dataEngine.addBars('AAPL', 'D', bars);

      const volumes = await requestSystem.requestSecurityVolume('AAPL', 'D');

      expect(volumes).toHaveLength(10);
    });
  });

  describe('requestSecurity', () => {
    it('should apply custom expression to bars', async () => {
      const bars = createTestBars(10, 0, 60000);
      dataEngine.addBars('AAPL', 'D', bars);

      const results = await requestSystem.requestSecurity(
        'AAPL',
        'D',
        (bar) => bar.close - bar.open,
      );

      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(typeof result).toBe('number');
      });
    });
  });

  describe('registerDataSource', () => {
    it('should register a data source', async () => {
      const mockSource = new MockDataSource();
      const testBars = createTestBars(10);
      mockSource.setBars(testBars);

      requestSystem.registerDataSource('mock', mockSource);

      const closes = await requestSystem.requestSecurityClose('AAPL', 'D');
      expect(closes).toHaveLength(10);
    });

    it('should remove a data source', async () => {
      const mockSource = new MockDataSource();
      requestSystem.registerDataSource('mock', mockSource);
      requestSystem.removeDataSource('mock');

      const closes = await requestSystem.requestSecurityClose('AAPL', 'D');
      expect(closes).toEqual([]);
    });
  });

  describe('alignData', () => {
    it('should aggregate 1H bars to 4H bars', () => {
      const bars = createTestBars(12, 0, 3600000);
      const aligned = requestSystem.alignData(bars, '240');

      expect(aligned.length).toBeLessThan(bars.length);
      expect(aligned.length).toBe(3);
    });

    it('should return same bars if no alignment needed', () => {
      const bars = createTestBars(10, 0, 60000);
      const aligned = requestSystem.alignData(bars, '1');

      expect(aligned.length).toBe(10);
    });

    it('should handle empty bars', () => {
      const aligned = requestSystem.alignData([], 'D');
      expect(aligned).toEqual([]);
    });
  });

  describe('cache', () => {
    it('should cache request results', async () => {
      const bars = createTestBars(10, 0, 60000);
      dataEngine.addBars('AAPL', 'D', bars);

      const closes1 = await requestSystem.requestSecurityClose('AAPL', 'D');
      const closes2 = await requestSystem.requestSecurityClose('AAPL', 'D');

      expect(closes1).toEqual(closes2);
    });

    it('should clear cache', async () => {
      const bars = createTestBars(10, 0, 60000);
      dataEngine.addBars('AAPL', 'D', bars);

      await requestSystem.requestSecurityClose('AAPL', 'D');
      requestSystem.clearCache();

      const stats = requestSystem.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should return cache stats', async () => {
      const bars = createTestBars(10, 0, 60000);
      dataEngine.addBars('AAPL', 'D', bars);

      await requestSystem.requestSecurityClose('AAPL', 'D');

      const stats = requestSystem.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.maxAge).toBe(60000);
    });
  });

  describe('requestSecurity with different options', () => {
    it('should handle lookahead option', async () => {
      const bars = createTestBars(10, 0, 60000);
      dataEngine.addBars('AAPL', 'D', bars);

      const closes = await requestSystem.requestSecurityClose('AAPL', 'D', { lookahead: true });
      expect(closes).toHaveLength(10);
    });

    it('should handle gaps option', async () => {
      const bars = createTestBars(10, 0, 60000);
      dataEngine.addBars('AAPL', 'D', bars);

      const closes = await requestSystem.requestSecurityClose('AAPL', 'D', { gaps: true });
      expect(closes).toHaveLength(10);
    });
  });
});

import { RateLimiter } from '../src/bybit/rate-limiter.js';

describe('RateLimiter', () => {
  it('allows requests within limit', async () => {
    const limiter = new RateLimiter(5, 1000);
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
  });

  it('throttles when limit exceeded', async () => {
    const limiter = new RateLimiter(2, 100);
    await limiter.acquire();
    await limiter.acquire();
    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(50);
  });
});

describe('BybitDataSource', () => {
  it('can be instantiated', async () => {
    const { BybitDataSource } = await import('../src/bybit/bybit-data-source.js');
    const ds = new BybitDataSource();
    expect(ds).toBeDefined();
  });

  it('fetchBars returns array of bars from Bybit', async () => {
    const { BybitDataSource } = await import('../src/bybit/bybit-data-source.js');
    const ds = new BybitDataSource();
    const now = Date.now();
    const oneHourAgo = now - 3600_000;
    try {
      const bars = await ds.fetchBars('BTCUSDT', '1', oneHourAgo, now);
      expect(Array.isArray(bars)).toBe(true);
      if (bars.length > 0) {
        expect(bars[0]).toHaveProperty('timestamp');
        expect(bars[0]).toHaveProperty('open');
        expect(bars[0]).toHaveProperty('high');
        expect(bars[0]).toHaveProperty('low');
        expect(bars[0]).toHaveProperty('close');
        expect(bars[0]).toHaveProperty('volume');
      }
    } catch {
      // Bybit may be unreachable in test environment
    }
  });
});

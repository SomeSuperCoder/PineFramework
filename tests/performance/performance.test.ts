import { ObjectPool, SeriesPool, MapPool } from '../../src/performance/object-pool.js';
import { LRUCache, TimeSeriesCache } from '../../src/performance/cache.js';
import { Profiler, ExecutionProfiler } from '../../src/performance/profiler.js';

describe('ObjectPool', () => {
  it('should create pool with initial size', () => {
    const pool = new ObjectPool({
      initialSize: 5,
      maxSize: 10,
      factory: () => ({ value: 0 }),
      reset: (item) => { item.value = 0; },
    });

    expect(pool.size).toBe(5);
    expect(pool.available).toBe(5);
  });

  it('should acquire items from pool', () => {
    const pool = new ObjectPool({
      initialSize: 5,
      maxSize: 10,
      factory: () => ({ value: 0 }),
      reset: (item) => { item.value = 0; },
    });

    const item = pool.acquire();
    expect(item).toBeDefined();
    expect(pool.available).toBe(4);
  });

  it('should release items back to pool', () => {
    const pool = new ObjectPool({
      initialSize: 5,
      maxSize: 10,
      factory: () => ({ value: 0 }),
      reset: (item) => { item.value = 0; },
    });

    const item = pool.acquire();
    pool.release(item);
    expect(pool.available).toBe(5);
  });

  it('should create new items when pool is empty', () => {
    const pool = new ObjectPool({
      initialSize: 1,
      maxSize: 10,
      factory: () => ({ value: 0 }),
      reset: (item) => { item.value = 0; },
    });

    pool.acquire();
    const item = pool.acquire();
    expect(item).toBeDefined();
    expect(pool.size).toBe(0);
    expect(pool.stats.totalCreated).toBe(2);
  });

  it('should throw when pool is exhausted', () => {
    const pool = new ObjectPool({
      initialSize: 1,
      maxSize: 1,
      factory: () => ({ value: 0 }),
      reset: (item) => { item.value = 0; },
    });

    pool.acquire();
    expect(() => pool.acquire()).toThrow('Pool exhausted');
  });

  it('should track stats', () => {
    const pool = new ObjectPool({
      initialSize: 5,
      maxSize: 10,
      factory: () => ({ value: 0 }),
      reset: (item) => { item.value = 0; },
    });

    const item = pool.acquire();
    pool.release(item);

    const stats = pool.stats;
    expect(stats.totalCreated).toBe(5);
    expect(stats.totalAcquired).toBe(1);
    expect(stats.totalReleased).toBe(1);
  });
});

describe('SeriesPool', () => {
  it('should acquire and release arrays', () => {
    const pool = new SeriesPool(5, 10);

    const arr = pool.acquire();
    expect(arr).toEqual([]);

    arr.push(1, 2, 3);
    pool.release(arr);

    const arr2 = pool.acquire();
    expect(arr2).toEqual([]);
  });
});

describe('MapPool', () => {
  it('should acquire and release maps', () => {
    const pool = new MapPool<string, number>(5, 10);

    const map = pool.acquire();
    expect(map.size).toBe(0);

    map.set('key', 1);
    pool.release(map);

    const map2 = pool.acquire();
    expect(map2.size).toBe(0);
  });
});

describe('LRUCache', () => {
  it('should store and retrieve values', () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });

    cache.set('key1', 100);
    expect(cache.get('key1')).toBe(100);
  });

  it('should return undefined for missing keys', () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });
    expect(cache.get('missing')).toBeUndefined();
  });

  it('should evict least recently used items', () => {
    const cache = new LRUCache<string, number>({ maxSize: 3 });

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
  });

  it('should update access time on get', () => {
    const cache = new LRUCache<string, number>({ maxSize: 3 });

    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    cache.get('a');
    cache.set('d', 4);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
  });

  it('should respect TTL', () => {
    const cache = new LRUCache<string, number>({ maxSize: 10, ttl: 1 });

    cache.set('key1', 100);

    const entry = (cache as unknown as { cache: Map<string, { lastAccessed: number }> }).cache.get('key1');
    if (entry) {
      entry.lastAccessed = Date.now() - 100;
    }

    expect(cache.get('key1')).toBeUndefined();
  });

  it('should track stats', () => {
    const cache = new LRUCache<string, number>({ maxSize: 10 });

    cache.set('key1', 100);
    cache.get('key1');
    cache.get('missing');

    const stats = cache.stats;
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(50);
  });
});

describe('TimeSeriesCache', () => {
  it('should store and retrieve time series data', () => {
    const cache = new TimeSeriesCache<number>(100);

    cache.set('AAPL', 0, 150);
    cache.set('AAPL', 1, 152);

    expect(cache.get('AAPL', 0)).toBe(150);
    expect(cache.get('AAPL', 1)).toBe(152);
  });

  it('should handle multiple symbols', () => {
    const cache = new TimeSeriesCache<number>(100);

    cache.set('AAPL', 0, 150);
    cache.set('GOOG', 0, 2800);

    expect(cache.get('AAPL', 0)).toBe(150);
    expect(cache.get('GOOG', 0)).toBe(2800);
  });

  it('should track stats', () => {
    const cache = new TimeSeriesCache<number>(100);

    cache.set('AAPL', 0, 150);
    cache.get('AAPL', 0);
    cache.get('AAPL', 1);

    const stats = cache.stats;
    expect(stats.symbolCount).toBe(1);
    expect(stats.totalSize).toBe(1);
    expect(stats.totalHits).toBe(1);
    expect(stats.totalMisses).toBe(1);
  });
});

describe('Profiler', () => {
  it('should measure execution time', () => {
    const profiler = new Profiler();

    profiler.start('test');
    const result = 1 + 1;
    profiler.end('test');

    expect(result).toBe(2);
    const stats = profiler.getStats('test');
    expect(stats).toBeDefined();
    expect(stats!.totalCalls).toBe(1);
  });

  it('should measure function execution', () => {
    const profiler = new Profiler();

    const result = profiler.measure('test', () => 1 + 1);

    expect(result).toBe(2);
    const stats = profiler.getStats('test');
    expect(stats!.totalCalls).toBe(1);
  });

  it('should track multiple calls', () => {
    const profiler = new Profiler();

    for (let i = 0; i < 5; i++) {
      profiler.measure('test', () => i);
    }

    const stats = profiler.getStats('test');
    expect(stats!.totalCalls).toBe(5);
  });

  it('should format report', () => {
    const profiler = new Profiler();

    profiler.measure('test1', () => 1);
    profiler.measure('test2', () => 2);

    const report = profiler.formatReport();
    expect(report).toContain('Performance Profile Report');
    expect(report).toContain('test1');
    expect(report).toContain('test2');
  });

  it('should clear all data', () => {
    const profiler = new Profiler();

    profiler.measure('test', () => 1);
    profiler.clear();

    const stats = profiler.getStats('test');
    expect(stats).toBeUndefined();
  });

  it('should respect enabled flag', () => {
    const profiler = new Profiler(false);

    profiler.start('test');
    profiler.end('test');

    const stats = profiler.getStats('test');
    expect(stats).toBeUndefined();
  });
});

describe('ExecutionProfiler', () => {
  it('should measure bar execution time', () => {
    const profiler = new ExecutionProfiler();

    profiler.startBar(0);
    const result = 1 + 1;
    profiler.endBar();

    expect(result).toBe(2);
    const stats = profiler.getBarStats();
    expect(stats.totalBars).toBe(1);
  });

  it('should track bar statistics', () => {
    const profiler = new ExecutionProfiler();

    for (let i = 0; i < 10; i++) {
      profiler.startBar(i);
      profiler.endBar();
    }

    const stats = profiler.getBarStats();
    expect(stats.totalBars).toBe(10);
    expect(stats.averageMs).toBeGreaterThanOrEqual(0);
    expect(stats.minMs).toBeGreaterThanOrEqual(0);
    expect(stats.maxMs).toBeGreaterThanOrEqual(stats.minMs);
  });

  it('should clear all data', () => {
    const profiler = new ExecutionProfiler();

    profiler.startBar(0);
    profiler.endBar();
    profiler.clear();

    const stats = profiler.getBarStats();
    expect(stats.totalBars).toBe(0);
  });
});

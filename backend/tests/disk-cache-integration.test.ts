import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Bar } from 'pine-framework';
import { DiskOHLCVCache } from '../src/cache/DiskOHLCVCache.js';
import { fetchBars } from '../src/bybit/fetch-bars.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createBar(
  timestamp: number,
  open = 100,
  high = 110,
  low = 90,
  close = 105,
  volume = 1000,
): Bar {
  return { timestamp, open, high, low, close, volume };
}

function makeBars(count: number, startTimestamp: number, intervalMs: number): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < count; i++) {
    bars.push(createBar(startTimestamp + i * intervalMs));
  }
  return bars;
}

/** Mock the global fetch function to simulate Bybit API responses. */
function mockFetch(barsFn: () => Bar[]): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
    const urlStr = url.toString();

    // Return time endpoint
    if (urlStr.includes('/v5/market/time')) {
      return new Response(JSON.stringify({ time: Date.now() }), { status: 200 });
    }

    // Return kline data
    if (urlStr.includes('/v5/market/kline')) {
      const bars = barsFn();
      const list = bars.map((b) => [
        String(b.timestamp),
        String(b.open),
        String(b.high),
        String(b.low),
        String(b.close),
        String(b.volume),
      ]);
      return new Response(
        JSON.stringify({ retCode: 0, retMsg: 'OK', result: { list } }),
        { status: 200 },
      );
    }

    return new Response('Not Found', { status: 404 });
  });
}

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe('DiskOHLCVCache Integration', () => {
  let cacheDir: string;
  let diskCache: DiskOHLCVCache;

  beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohlcv-cache-int-'));
    diskCache = new DiskOHLCVCache({
      cacheDir,
      maxDiskUsageBytes: 50 * 1024 * 1024, // 50MB
      historicalThresholdMs: 60_000,
      recentTtlMs: 60_000,
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // 4.1: Full round-trip — write, then read from cache (simulate restart)
  // -----------------------------------------------------------------------
  it('serves cached data after simulated restart', async () => {
    const bars = makeBars(50, 100_000, 60_000);

    // First "session": write to cache
    await diskCache.set('BTCUSDT', '60', bars);
    const firstRead = diskCache.get('BTCUSDT', '60');
    expect(firstRead).toHaveLength(50);

    // Verify files exist on disk
    const ndjsonFile = path.join(cacheDir, 'BTCUSDT_60.ndjson');
    const metaFile = path.join(cacheDir, 'BTCUSDT_60.meta.json');
    expect(fs.existsSync(ndjsonFile)).toBe(true);
    expect(fs.existsSync(metaFile)).toBe(true);

    // Simulate restart: create a new DiskOHLCVCache instance pointing to the same dir
    const diskCache2 = new DiskOHLCVCache({
      cacheDir,
      maxDiskUsageBytes: 50 * 1024 * 1024,
      historicalThresholdMs: 60_000,
      recentTtlMs: 60_000,
    });

    // Second "session": read from cache
    const secondRead = diskCache2.get('BTCUSDT', '60');
    expect(secondRead).not.toBeNull();
    expect(secondRead).toHaveLength(50);
    expect(secondRead![0].timestamp).toBe(100_000);
    expect(secondRead![49].timestamp).toBe(100_000 + 49 * 60_000);
  });

  // -----------------------------------------------------------------------
  // 4.2: fetchBars with disk cache
  // -----------------------------------------------------------------------
  it('fetchBars returns from disk cache on second call', async () => {
    const bars = makeBars(10, 1_000_000_000_000, 60_000); // distant future = not stale
    mockFetch(() => bars);

    // First call: should hit API (mock) and write to cache
    const firstResult = await fetchBars('BTCUSDT', '60', undefined, undefined, undefined, diskCache);
    expect(firstResult).toHaveLength(10);

    // Restore mock and verify cache serves second call without API
    vi.restoreAllMocks();

    // Spy on fetch to ensure it's NOT called
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const secondResult = await fetchBars('BTCUSDT', '60', undefined, undefined, undefined, diskCache);
    expect(secondResult).toHaveLength(10);
    // The cache hit should mean no fetch call for the kline endpoint
    const klineCalls = fetchSpy.mock.calls.filter(
      ([url]) => url.toString().includes('/v5/market/kline'),
    );
    expect(klineCalls).toHaveLength(0);
  });

  it('fetchBars writes to disk cache after API call', async () => {
    const bars = makeBars(10, 1_000_000_000_000, 60_000);
    mockFetch(() => bars);

    await fetchBars('BTCUSDT', '60', undefined, undefined, undefined, diskCache);

    // Verify cache files exist
    const ndjsonFile = path.join(cacheDir, 'BTCUSDT_60.ndjson');
    expect(fs.existsSync(ndjsonFile)).toBe(true);

    // Read back from cache directly
    const cached = diskCache.get('BTCUSDT', '60');
    expect(cached).toHaveLength(10);
  });

  // -----------------------------------------------------------------------
  // 4.3: Partial range — fetch T1..T100, then T50..T150
  // -----------------------------------------------------------------------
  it('serves overlapping ranges from cache', async () => {
    // Write bars 0..99
    const bars1 = makeBars(100, 0, 60_000);
    await diskCache.set('BTCUSDT', '60', bars1);

    // Fetch range 20..50
    const range1 = diskCache.get('BTCUSDT', '60', 20 * 60_000, 50 * 60_000);
    expect(range1).toHaveLength(31); // 20..50 inclusive
    expect(range1![0].timestamp).toBe(20 * 60_000);
    expect(range1![30].timestamp).toBe(50 * 60_000);

    // Fetch range 40..80 (overlapping)
    const range2 = diskCache.get('BTCUSDT', '60', 40 * 60_000, 80 * 60_000);
    expect(range2).toHaveLength(41); // 40..80 inclusive
    expect(range2![0].timestamp).toBe(40 * 60_000);
    expect(range2![40].timestamp).toBe(80 * 60_000);
  });

  // -----------------------------------------------------------------------
  // 4.4: Cache eviction with tight limit
  // -----------------------------------------------------------------------
  it('evicts entries when disk limit is reached', async () => {
    // Create a cache with a very tight limit
    const tightCache = new DiskOHLCVCache({
      cacheDir,
      maxDiskUsageBytes: 3000, // ~3KB — holds about 2-3 symbol entries
      historicalThresholdMs: 60_000,
      recentTtlMs: 60_000,
    });

    // Write enough symbols to exceed the limit
    const bars = makeBars(5, 0, 60_000);
    for (let i = 0; i < 20; i++) {
      await tightCache.set(`SYM${i}USDT`, '60', bars);
    }

    // Force eviction
    tightCache.enforceDiskLimit();

    // Check disk usage is below limit
    let totalSize = 0;
    const files = fs.readdirSync(cacheDir);
    for (const file of files) {
      if (file.endsWith('.ndjson') || file.endsWith('.meta.json')) {
        const filePath = path.join(cacheDir, file);
        try {
          totalSize += fs.statSync(filePath).size;
        } catch {
          // may have been evicted mid-loop
        }
      }
    }

    expect(totalSize).toBeLessThanOrEqual(3500); // allow small margin

    // Stats should reflect eviction
    const stats = tightCache.getStats();
    expect(stats.diskUsageBytes).toBeLessThanOrEqual(3500);
  });
});

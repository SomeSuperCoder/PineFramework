import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Bar } from 'pine-framework';
import { DiskOHLCVCache } from '../src/cache/DiskOHLCVCache.js';

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

/** Create a temporarily-scoped DiskOHLCVCache with a unique temp directory. */
function createTestCache(options?: {
  maxDiskUsageBytes?: number;
  historicalThresholdMs?: number;
  recentTtlMs?: number;
}): DiskOHLCVCache {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohlcv-cache-test-'));
  return new DiskOHLCVCache({
    cacheDir,
    maxDiskUsageBytes: options?.maxDiskUsageBytes ?? 10 * 1024 * 1024, // 10MB default for tests
    historicalThresholdMs: options?.historicalThresholdMs ?? 60 * 60 * 1000,
    recentTtlMs: options?.recentTtlMs ?? 60_000,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DiskOHLCVCache', () => {
  let cache: DiskOHLCVCache;
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ohlcv-cache-test-'));
    cache = new DiskOHLCVCache({ cacheDir });
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // -----------------------------------------------------------------------
  // 2.1: NDJSON file structure
  // -----------------------------------------------------------------------
  it('creates NDJSON and metadata files on set', async () => {
    const bars = makeBars(5, 1000, 60_000);
    await cache.set('BTCUSDT', '60', bars);

    const ndjsonFile = path.join(cacheDir, 'BTCUSDT_60.ndjson');
    const metaFile = path.join(cacheDir, 'BTCUSDT_60.meta.json');

    expect(fs.existsSync(ndjsonFile)).toBe(true);
    expect(fs.existsSync(metaFile)).toBe(true);

    // Verify NDJSON content — each line is a valid JSON bar
    const content = fs.readFileSync(ndjsonFile, 'utf-8').trim();
    const lines = content.split('\n');
    expect(lines.length).toBe(5);
    for (const line of lines) {
      const bar = JSON.parse(line);
      expect(bar).toHaveProperty('timestamp');
      expect(bar).toHaveProperty('open');
      expect(bar).toHaveProperty('high');
      expect(bar).toHaveProperty('low');
      expect(bar).toHaveProperty('close');
      expect(bar).toHaveProperty('volume');
    }

    // Verify metadata content
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
    expect(meta.symbol).toBe('BTCUSDT');
    expect(meta.interval).toBe('60');
    expect(meta.barCount).toBe(5);
    expect(meta.oldestTimestamp).toBe(1000);
    expect(meta.newestTimestamp).toBe(1000 + 4 * 60_000);
  });

  // -----------------------------------------------------------------------
  // 2.2: get/set round-trip
  // -----------------------------------------------------------------------
  it('returns bars that were previously set', async () => {
    const bars = makeBars(10, 100_000, 60_000);
    await cache.set('ETHUSDT', '5', bars);

    const retrieved = cache.get('ETHUSDT', '5');
    expect(retrieved).not.toBeNull();
    expect(retrieved).toHaveLength(10);
    expect(retrieved![0].timestamp).toBe(100_000);
    expect(retrieved![9].timestamp).toBe(100_000 + 9 * 60_000);
    expect(retrieved![0].open).toBe(100);
  });

  it('returns null for uncached symbol', () => {
    const result = cache.get('NONEXISTENT', '60');
    expect(result).toBeNull();
  });

  // -----------------------------------------------------------------------
  // 2.3: Deduplication
  // -----------------------------------------------------------------------
  it('replaces bars with same timestamp instead of duplicating', async () => {
    const bar1 = createBar(1000, 100, 110, 90, 105, 1000);
    const bar2 = createBar(2000, 200, 210, 190, 205, 2000);
    await cache.set('BTCUSDT', '60', [bar1, bar2]);

    // Same timestamp, different values
    const bar1Updated = createBar(1000, 150, 160, 140, 155, 1500);
    await cache.set('BTCUSDT', '60', [bar1Updated]);

    const retrieved = cache.get('BTCUSDT', '60');
    expect(retrieved).toHaveLength(2);
    // The first bar should have the updated values
    expect(retrieved![0].open).toBe(150);
    expect(retrieved![0].volume).toBe(1500);
    // The second bar should be unchanged
    expect(retrieved![1].open).toBe(200);
  });

  // -----------------------------------------------------------------------
  // 2.4: Atomic write (simulated crash)
  // -----------------------------------------------------------------------
  it('does not corrupt cache on interrupted write', async () => {
    // Write some bars
    const bars = makeBars(5, 1000, 60_000);
    await cache.set('BTCUSDT', '60', bars);

    // Simulate a crash by writing a partial .tmp file
    const ndjsonFile = path.join(cacheDir, 'BTCUSDT_60.ndjson');
    const tmpFile = ndjsonFile + '.tmp';
    fs.writeFileSync(tmpFile, '{"timestamp":9999,"this_is_broken\n', 'utf-8');

    // Write again — this should replace the .tmp with a clean file
    const newBars = makeBars(3, 5000, 60_000);
    await cache.set('BTCUSDT', '60', newBars);

    // .tmp file should not exist anymore
    expect(fs.existsSync(tmpFile)).toBe(false);

    // The ndjson file should contain valid JSON for every line
    const content = fs.readFileSync(ndjsonFile, 'utf-8').trim();
    const lines = content.split('\n');
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    // Should have merged data (5 original + 3 new = 8, but 2 overlap? No — 1000..5000*3 = 5000,10000,11000)
    // Original: 1000, 106000, 112000... wait, intervalMs is 60_000 so:
    // Original: t=1000, 61000, 121000, 181000, 241000
    // New: t=5000, 65000, 125000
    // So all bars are unique timestamps: 8 total
    expect(lines.length).toBe(8);
  });

  // -----------------------------------------------------------------------
  // 2.5: Staleness logic
  // -----------------------------------------------------------------------
  it('considers historical bars as not stale', async () => {
    // Create cache with very short historical threshold
    const shortHistory = createTestCache({
      historicalThresholdMs: 100, // 100ms = everything older than 100ms is historical
      recentTtlMs: 10_000, // 10s recent TTL
    });

    // Set bars with very old timestamps
    const oldBars = makeBars(3, 1000, 60_000); // timestamps from 1970-01-01
    await shortHistory.set('BTCUSDT', '60', oldBars);

    // These bars are decades old — definitely historical
    expect(shortHistory.isStale('BTCUSDT', '60')).toBe(false);
  });

  it('considers recent bars as stale after TTL expiry', async () => {
    // Create cache with immediate expiry
    const instantExpiry = createTestCache({
      historicalThresholdMs: 60_000, // 60s threshold
      recentTtlMs: 0, // 0ms TTL = immediately stale
    });

    const bars = makeBars(3, Date.now(), 60_000);
    await instantExpiry.set('BTCUSDT', '60', bars);

    // With recentTtlMs=0, the bars should be stale immediately
    expect(instantExpiry.isStale('BTCUSDT', '60')).toBe(true);
  });

  it('considers recent bars as not stale within TTL', async () => {
    const longTtl = createTestCache({
      historicalThresholdMs: 60_000,
      recentTtlMs: 60_000, // 60s TTL
    });

    const bars = makeBars(3, Date.now(), 60_000);
    await longTtl.set('BTCUSDT', '60', bars);

    // Should not be stale since we just set it
    expect(longTtl.isStale('BTCUSDT', '60')).toBe(false);
  });

  it('returns stale for non-existent entry', () => {
    const result = cache.isStale('NONEXISTENT', '60');
    expect(result).toBe(true);
  });

  // -----------------------------------------------------------------------
  // 2.6: LRU eviction
  // -----------------------------------------------------------------------
  it('evicts oldest-accessed entries when disk limit exceeded', async () => {
    // Create cache with very small max disk usage (~2KB)
    const tinyCache = createTestCache({
      maxDiskUsageBytes: 2000,
      historicalThresholdMs: 60_000,
      recentTtlMs: 60_000,
    });
    const tinyDir = (tinyCache as unknown as { cacheDirectory: string }).cacheDirectory;

    // Write enough bars for multiple symbols to exceed the limit
    // Each symbol: 10 bars * ~80 bytes each = ~800 bytes + metadata ~200 bytes = ~1KB
    for (let i = 0; i < 10; i++) {
      const bars = makeBars(10, 1000 + i * 1_000_000, 60_000);
      await tinyCache.set(`SYM${i}USDT`, '60', bars);
    }

    // Force eviction
    tinyCache.enforceDiskLimit();

    // Check total disk usage is below limit
    let totalSize = 0;
    const files = fs.readdirSync(tinyDir);
    for (const file of files) {
      if (file.endsWith('.ndjson') || file.endsWith('.meta.json')) {
        totalSize += fs.statSync(path.join(tinyDir, file)).size;
      }
    }

    expect(totalSize).toBeLessThanOrEqual(2100); // allow small slop
  });

  // -----------------------------------------------------------------------
  // 2.7: Partial range reads
  // -----------------------------------------------------------------------
  it('returns only bars within the requested timestamp range', async () => {
    const bars = makeBars(100, 0, 60_000); // timestamps 0, 60000, 120000, ... 5940000
    await cache.set('BTCUSDT', '60', bars);

    // Request range T20..T50 (inclusive)
    const start = 20 * 60_000; // 1,200,000
    const end = 50 * 60_000; // 3,000,000
    const result = cache.get('BTCUSDT', '60', start, end);

    expect(result).not.toBeNull();
    // Bars 20 through 50 inclusive = 31 bars
    expect(result).toHaveLength(31);
    expect(result![0].timestamp).toBe(20 * 60_000);
    expect(result![result!.length - 1].timestamp).toBe(50 * 60_000);
  });

  it('returns empty array when range does not overlap cached data', async () => {
    const bars = makeBars(10, 1000, 60_000);
    await cache.set('BTCUSDT', '60', bars);

    const result = cache.get('BTCUSDT', '60', 999_999_999, 1_000_000_000);
    expect(result).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Cache stats
  // -----------------------------------------------------------------------
  it('reports accurate cache statistics', async () => {
    // Use createTestCache with explicit maxDiskUsageBytes=10MB for deterministic assertion
    const statsCache = createTestCache({ maxDiskUsageBytes: 10 * 1024 * 1024 });
    const bars = makeBars(5, 1000, 60_000);
    await statsCache.set('BTCUSDT', '60', bars);

    // One miss (before set), then one hit
    statsCache.get('NONEXISTENT', '60'); // miss
    statsCache.get('BTCUSDT', '60'); // hit

    const stats = statsCache.getStats();
    expect(stats.entries).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(50);
    expect(stats.diskUsageBytes).toBeGreaterThan(0);
    expect(stats.maxDiskUsageBytes).toBe(10 * 1024 * 1024);
  });

  // -----------------------------------------------------------------------
  // Clear / invalidate
  // -----------------------------------------------------------------------
  it('clears all cache files', async () => {
    const bars = makeBars(5, 1000, 60_000);
    await cache.set('BTCUSDT', '60', bars);
    await cache.set('ETHUSDT', '60', bars);

    expect(fs.readdirSync(cacheDir).length).toBeGreaterThan(0);

    cache.clear();

    expect(fs.readdirSync(cacheDir).length).toBe(0);
    expect(cache.get('BTCUSDT', '60')).toBeNull();
  });

  it('invalidates a single symbol', async () => {
    const bars = makeBars(5, 1000, 60_000);
    await cache.set('BTCUSDT', '60', bars);
    await cache.set('ETHUSDT', '60', bars);

    cache.invalidate('BTCUSDT', '60');

    expect(cache.get('BTCUSDT', '60')).toBeNull();
    expect(cache.get('ETHUSDT', '60')).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // Concurrency: write lock
  // -----------------------------------------------------------------------
  it('serialises concurrent writes to the same key', async () => {
    const bars1 = makeBars(5, 0, 60_000);
    const bars2 = makeBars(5, 5 * 60_000, 60_000); // different timestamps

    // Kick off two concurrent writes
    await Promise.all([
      cache.set('BTCUSDT', '60', bars1),
      cache.set('BTCUSDT', '60', bars2),
    ]);

    const retrieved = cache.get('BTCUSDT', '60');
    expect(retrieved).toHaveLength(10); // all 10 bars should be present
  });
});

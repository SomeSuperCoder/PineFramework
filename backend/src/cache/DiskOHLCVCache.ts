import type { Bar } from 'pine-framework';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default cache directory relative to backend root (resolved in constructor). */
const DEFAULT_CACHE_DIR = 'data/ohlcv-cache';

/** Default maximum total disk usage for the cache (500 MB). */
const DEFAULT_MAX_DISK_USAGE_BYTES = 500 * 1024 * 1024;

/**
 * Bars whose `timestamp` is older than this threshold (ms from now) are
 * considered immutable — they are never re-fetched from the API.
 * Default: 1 hour.
 */
const DEFAULT_HISTORICAL_THRESHOLD_MS = 60 * 60 * 1000;

/**
 * Bars within the recent window are re-fetched if the cache entry's
 * `lastFetchedAt` is older than this TTL. Default: 60 seconds.
 */
const DEFAULT_RECENT_TTL_MS = 60_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-(symbol, interval) metadata persisted to disk. */
interface CacheMeta {
  symbol: string;
  interval: string;
  oldestTimestamp: number;
  newestTimestamp: number;
  lastFetchedAt: number;
  lastAccessed: number;
  barCount: number;
  fileSizeBytes: number;
}

/** Public stats shape for the /api/status endpoint. */
export interface DiskCacheStats {
  entries: number;
  hits: number;
  misses: number;
  hitRate: number;
  diskUsageBytes: number;
  maxDiskUsageBytes: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sanitise a symbol- interval pair to a safe filename component. */
function cacheKey(symbol: string, interval: string): string {
  // Symbols like "BTCUSDT" and intervals like "60" are already safe — but
  // encode any non-alphanumeric characters to prevent path traversal.
  const safeSymbol = symbol.replace(/[^A-Z0-9]/gi, '_');
  const safeInterval = String(interval).replace(/[^A-Z0-9]/gi, '_');
  return `${safeSymbol}_${safeInterval}`;
}

/** Resolve the NDJSON data file path for a given key. */
function ndjsonPath(cacheDir: string, key: string): string {
  return path.join(cacheDir, `${key}.ndjson`);
}

/** Resolve the metadata JSON file path for a given key. */
function metaPath(cacheDir: string, key: string): string {
  return path.join(cacheDir, `${key}.meta.json`);
}

// ---------------------------------------------------------------------------
// DiskOHLCVCache
// ---------------------------------------------------------------------------

/**
 * Persistent disk-backed L2 cache for OHLCV bar data.
 *
 * **Cache layers (fastest → slowest):**
 * 1. `OHLCVCache` (in-memory, L1) — sub-ms lookups, lost on restart
 * 2. `DiskOHLCVCache` (disk, L2) — survives restarts, ms lookups
 * 3. Bybit REST API (remote, L3) — ~200-500ms, rate-limited
 *
 * **Staleness rules:**
 * - Bars with `timestamp < (now - historicalThresholdMs)` are **permanent** —
 *   never re-fetched from the API.
 * - Bars within the recent window are re-fetched if the cached entry's
 *   `lastFetchedAt` exceeds `recentTtlMs`.
 *
 * **Storage format:** One NDJSON file per `(symbol, interval)` pair, with a
 * companion `.meta.json` file. NDJSON enables append-only writes without
 * rewriting the entire history. Writes are atomic: data is written to a `.tmp`
 * file first, then atomically renamed to the final path.
 *
 * **Disk space management:** When total cache size exceeds `maxDiskUsageBytes`,
 * the least-recently-accessed entries are evicted (LRU).
 */
export class DiskOHLCVCache {
  private cacheDir: string;
  private maxDiskUsageBytes: number;
  private historicalThresholdMs: number;
  private recentTtlMs: number;

  /** Per-key write lock: Map<key, Promise<void>> to serialise concurrent writes. */
  private writeLocks = new Map<string, Promise<void>>();

  /** Hit/miss counters (in-memory, reset on restart). */
  private hits = 0;
  private misses = 0;

  constructor(options?: {
    cacheDir?: string;
    maxDiskUsageBytes?: number;
    historicalThresholdMs?: number;
    recentTtlMs?: number;
  }) {
    this.cacheDir = path.resolve(options?.cacheDir ?? DEFAULT_CACHE_DIR);
    this.maxDiskUsageBytes = options?.maxDiskUsageBytes ?? DEFAULT_MAX_DISK_USAGE_BYTES;
    this.historicalThresholdMs = options?.historicalThresholdMs ?? DEFAULT_HISTORICAL_THRESHOLD_MS;
    this.recentTtlMs = options?.recentTtlMs ?? DEFAULT_RECENT_TTL_MS;

    // Ensure the cache directory exists
    fs.mkdirSync(this.cacheDir, { recursive: true });

    logger.info(
      {
        cacheDir: this.cacheDir,
        maxDiskUsageMB: Math.round(this.maxDiskUsageBytes / (1024 * 1024)),
        historicalThresholdSec: Math.round(this.historicalThresholdMs / 1000),
        recentTtlSec: Math.round(this.recentTtlMs / 1000),
      },
      'DiskOHLCVCache initialized',
    );
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Retrieve cached bars for a symbol/interval pair, optionally filtered by
   * timestamp range.
   *
   * @param symbol   Trading pair (e.g. "BTCUSDT")
   * @param interval Bybit interval string (e.g. "60", "D")
   * @param start    Optional UNIX-ms start timestamp (inclusive)
   * @param end      Optional UNIX-ms end timestamp (inclusive)
   * @returns Array of bars, or `null` if no cached data exists for this pair.
   */
  get(symbol: string, interval: string, start?: number, end?: number): Bar[] | null {
    const key = cacheKey(symbol, interval);
    const dataFile = ndjsonPath(this.cacheDir, key);
    const metaFile = metaPath(this.cacheDir, key);

    if (!fs.existsSync(dataFile)) {
      this.misses++;
      return null;
    }

    // Read metadata, update lastAccessed
    let meta: CacheMeta;
    try {
      meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8')) as CacheMeta;
    } catch {
      this.misses++;
      return null;
    }

    meta.lastAccessed = Date.now();
    this.writeMeta(key, meta);

    // Read bars from NDJSON
    const bars = this.readNdjson(dataFile, start, end);
    if (bars.length === 0) {
      this.misses++;
      return null;
    }

    this.hits++;
    return bars;
  }

  /**
   * Store bars in the disk cache. Appends new bars (deduplicated by timestamp)
   * to the NDJSON file and updates the metadata.
   *
   * Uses an in-memory per-key write lock so concurrent calls for the same
   * symbol/interval are serialised — the second caller waits for the first
   * to finish, then re-reads the merged result.
   */
  async set(symbol: string, interval: string, bars: Bar[]): Promise<void> {
    if (bars.length === 0) return;

    const key = cacheKey(symbol, interval);

    // Per-key write lock: serialise concurrent writes to the same file
    const existingLock = this.writeLocks.get(key) ?? Promise.resolve();
    const newLock = existingLock.then(() => this.doSet(key, symbol, interval, bars));
    // Avoid unhandled rejection by catching and re-throwing
    this.writeLocks.set(
      key,
      newLock.catch((err) => {
        this.writeLocks.delete(key);
        throw err;
      }),
    );
    // Clean up lock after completion
    newLock.finally(() => {
      if (this.writeLocks.get(key) === newLock) {
        this.writeLocks.delete(key);
      }
    });

    return newLock;
  }

  /**
   * Check whether the cached data for a symbol/interval pair is stale.
   *
   * Returns `false` (not stale) if:
   * - No cached data exists (nothing to be stale about), or
   * - The newest bar's timestamp is older than `historicalThresholdMs`
   *   (immutable historical data).
   *
   * Returns `true` (stale, should re-fetch) if:
   * - The newest bar is within the recent window AND
   * - `lastFetchedAt` is older than `recentTtlMs`.
   */
  isStale(symbol: string, interval: string): boolean {
    const key = cacheKey(symbol, interval);
    const metaFile = metaPath(this.cacheDir, key);

    if (!fs.existsSync(metaFile)) return true; // no cache → treat as stale

    let meta: CacheMeta;
    try {
      meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8')) as CacheMeta;
    } catch {
      return true;
    }

    const now = Date.now();

    // If the newest bar is historical (older than the threshold), it's permanent
    if (now - meta.newestTimestamp >= this.historicalThresholdMs) {
      return false;
    }

    // Recent window: check if the last fetch was too long ago
    // Use >= so that recentTtlMs=0 means "immediately stale"
    return now - meta.lastFetchedAt >= this.recentTtlMs;
  }

  /**
   * Ensure total disk usage stays below `maxDiskUsageBytes`.
   *
   * Evicts the least-recently-accessed entries (by `lastAccessed` in metadata)
   * until the total is within bounds. Called automatically after writes but
   * can also be invoked manually.
   */
  enforceDiskLimit(): void {
    const totalBytes = this.computeDiskUsage();

    if (totalBytes <= this.maxDiskUsageBytes) return;

    // Collect all entries with their lastAccessed time for LRU eviction
    interface Entry {
      key: string;
      lastAccessed: number;
      totalBytes: number;
    }
    const entries: Entry[] = [];

    try {
      const files = fs.readdirSync(this.cacheDir);
      const seen = new Set<string>();

      for (const file of files) {
        if (!file.endsWith('.meta.json')) continue;
        const key = file.slice(0, -'.meta.json'.length);
        if (seen.has(key)) continue;
        seen.add(key);

        try {
          const metaRaw = fs.readFileSync(path.join(this.cacheDir, file), 'utf-8');
          const meta = JSON.parse(metaRaw) as CacheMeta;
          const dataFile = ndjsonPath(this.cacheDir, key);
          const ndjsonBytes = fs.existsSync(dataFile) ? fs.statSync(dataFile).size : 0;
          const metaBytes = fs.statSync(path.join(this.cacheDir, file)).size;
          entries.push({
            key,
            lastAccessed: meta.lastAccessed,
            totalBytes: ndjsonBytes + metaBytes,
          });
        } catch {
          // Skip unparseable entries
        }
      }
    } catch {
      return; // Can't read directory — give up
    }

    // Sort by lastAccessed ascending (oldest first = best eviction candidate)
    entries.sort((a, b) => a.lastAccessed - b.lastAccessed);

    let overBytes = totalBytes - this.maxDiskUsageBytes;
    for (const entry of entries) {
      if (overBytes <= 0) break;
      this.removeEntry(entry.key);
      overBytes -= entry.totalBytes;
    }
  }

  /**
   * Return cache statistics for monitoring / the status endpoint.
   */
  getStats(): DiskCacheStats {
    const diskUsageBytes = this.computeDiskUsage();
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;

    // Count entries
    let entries = 0;
    try {
      const files = fs.readdirSync(this.cacheDir);
      const seen = new Set<string>();
      for (const file of files) {
        if (file.endsWith('.meta.json')) {
          const key = file.slice(0, -'.meta.json'.length);
          if (!seen.has(key)) {
            seen.add(key);
            entries++;
          }
        }
      }
    } catch {
      // Directory may not exist yet
    }

    return {
      entries,
      hits: this.hits,
      misses: this.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      diskUsageBytes,
      maxDiskUsageBytes: this.maxDiskUsageBytes,
    };
  }

  /**
   * Remove all cache files for a specific (symbol, interval) pair.
   */
  invalidate(symbol: string, interval: string): void {
    const key = cacheKey(symbol, interval);
    this.removeEntry(key);
  }

  /**
   * Remove ALL cache files and reset in-memory counters.
   */
  clear(): void {
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.ndjson') || file.endsWith('.meta.json') || file.endsWith('.tmp')) {
          try {
            fs.unlinkSync(path.join(this.cacheDir, file));
          } catch {
            // Best-effort
          }
        }
      }
    } catch {
      // Directory may not exist
    }
    this.hits = 0;
    this.misses = 0;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Actual write logic, guarded by the per-key write lock.
   */
  private async doSet(key: string, symbol: string, interval: string, newBars: Bar[]): Promise<void> {
    const dataFile = ndjsonPath(this.cacheDir, key);
    const metaFile = metaPath(this.cacheDir, key);

    // Read existing bars + metadata
    const existingBars = fs.existsSync(dataFile) ? this.readNdjson(dataFile) : [];
    let meta: CacheMeta = this.readOrCreateMeta(metaFile, symbol, interval);

    // Merge: existing bars first, then append new bars (skip duplicates)
    const merged = this.mergeBars(existingBars, newBars);

    // Write NDJSON atomically
    const tmpFile = dataFile + '.tmp';
    const lines = merged.map((b) => JSON.stringify(b)).join('\n') + '\n';
    fs.writeFileSync(tmpFile, lines, 'utf-8');
    fs.renameSync(tmpFile, dataFile);

    // Update metadata
    const stat = fs.statSync(dataFile);
    const now = Date.now();
    meta.oldestTimestamp = merged[0]!.timestamp;
    meta.newestTimestamp = merged[merged.length - 1]!.timestamp;
    meta.lastFetchedAt = now;
    meta.lastAccessed = now;
    meta.barCount = merged.length;
    meta.fileSizeBytes = stat.size;
    this.writeMeta(key, meta);

    // Enforce disk limit after write
    this.enforceDiskLimit();
  }

  /**
   * Read bars from an NDJSON file, optionally filtered by timestamp range.
   */
  private readNdjson(filePath: string, start?: number, end?: number): Bar[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    const bars: Bar[] = [];

    for (const line of lines) {
      if (!line) continue;
      try {
        const bar = JSON.parse(line) as Bar;
        if (start !== undefined && bar.timestamp < start) continue;
        if (end !== undefined && bar.timestamp > end) continue;
        bars.push(bar);
      } catch {
        // Skip malformed lines
      }
    }

    return bars;
  }

  /**
   * Merge existing bars with new bars, deduplicating by timestamp.
   * New bars with a timestamp matching an existing bar **replace** the old one.
   * Returns a chronologically sorted array.
   */
  private mergeBars(existing: Bar[], incoming: Bar[]): Bar[] {
    const map = new Map<number, Bar>();

    for (const bar of existing) {
      map.set(bar.timestamp, bar);
    }
    for (const bar of incoming) {
      map.set(bar.timestamp, bar);
    }

    return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Read an existing metadata file, or create a default one.
   */
  private readOrCreateMeta(metaFile: string, symbol: string, interval: string): CacheMeta {
    try {
      return JSON.parse(fs.readFileSync(metaFile, 'utf-8')) as CacheMeta;
    } catch {
      return {
        symbol,
        interval,
        oldestTimestamp: Infinity,
        newestTimestamp: -Infinity,
        lastFetchedAt: 0,
        lastAccessed: 0,
        barCount: 0,
        fileSizeBytes: 0,
      };
    }
  }

  /**
   * Write metadata to disk atomically (via .tmp + rename).
   */
  private writeMeta(key: string, meta: CacheMeta): void {
    const metaFile = metaPath(this.cacheDir, key);
    const tmpFile = metaFile + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(meta, null, 2), 'utf-8');
    fs.renameSync(tmpFile, metaFile);
  }

  /**
   * Calculate total size of all cache files on disk.
   */
  private computeDiskUsage(): number {
    let total = 0;
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.ndjson') || file.endsWith('.meta.json')) {
          try {
            total += fs.statSync(path.join(this.cacheDir, file)).size;
          } catch {
            // File may have been deleted between readdir and stat
          }
        }
      }
    } catch {
      // Directory may not exist
    }
    return total;
  }

  /**
   * Remove all files associated with a cache key.
   */
  private removeEntry(key: string): void {
    const ndjson = ndjsonPath(this.cacheDir, key);
    const meta = metaPath(this.cacheDir, key);
    const tmp1 = ndjson + '.tmp';
    const tmp2 = meta + '.tmp';

    for (const f of [ndjson, meta, tmp1, tmp2]) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        // Best-effort
      }
    }
  }

  /** Exposed for testing — get the resolved cache directory path. */
  get cacheDirectory(): string {
    return this.cacheDir;
  }
}

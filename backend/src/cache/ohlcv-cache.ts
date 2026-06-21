import type { Bar } from 'pine-framework';

interface CacheEntry {
  data: Bar[];
  lastAccessed: number;
}

export class OHLCVCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize = 100, ttlMs = 60_000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  private makeKey(symbol: string, interval: string): string {
    return `${symbol}:${interval}`;
  }

  get(symbol: string, interval: string): Bar[] | null {
    const key = this.makeKey(symbol, interval);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.lastAccessed > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    entry.lastAccessed = Date.now();
    return entry.data;
  }

  set(symbol: string, interval: string, data: Bar[]): void {
    const key = this.makeKey(symbol, interval);
    if (this.cache.size >= this.maxSize) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of this.cache) {
        if (v.lastAccessed < oldestTime) {
          oldestTime = v.lastAccessed;
          oldestKey = k;
        }
      }
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { data, lastAccessed: Date.now() });
  }

  invalidate(symbol: string, interval: string): void {
    this.cache.delete(this.makeKey(symbol, interval));
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

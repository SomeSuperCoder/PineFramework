export interface CacheEntry<V> {
  value: V;
  lastAccessed: number;
  accessCount: number;
}

export interface LRUCacheOptions {
  maxSize: number;
  ttl?: number;
}

export class LRUCache<K, V> {
  private cache: Map<K, CacheEntry<V>>;
  private options: LRUCacheOptions;
  private hits: number;
  private misses: number;

  constructor(options: LRUCacheOptions) {
    this.options = options;
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (this.options.ttl && Date.now() - entry.lastAccessed > this.options.ttl) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    entry.lastAccessed = Date.now();
    entry.accessCount++;
    this.hits++;

    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.options.maxSize) {
      this.evict();
    }

    this.cache.set(key, {
      value,
      lastAccessed: Date.now(),
      accessCount: 0,
    });
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.options.ttl && Date.now() - entry.lastAccessed > this.options.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  get size(): number {
    return this.cache.size;
  }

  get stats() {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0 ? (this.hits / (this.hits + this.misses)) * 100 : 0,
    };
  }

  private evict(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
    }
  }
}

export class TimeSeriesCache<V> {
  private caches: Map<string, LRUCache<number, V>>;
  private defaultTTL: number;

  constructor(_maxSizePerSymbol: number = 10000, defaultTTL: number = 300000) {
    this.caches = new Map();
    this.defaultTTL = defaultTTL;
  }

  get(symbol: string, barIndex: number): V | undefined {
    const cache = this.caches.get(symbol);
    return cache?.get(barIndex);
  }

  set(symbol: string, barIndex: number, value: V): void {
    let cache = this.caches.get(symbol);
    if (!cache) {
      cache = new LRUCache({ maxSize: 10000, ttl: this.defaultTTL });
      this.caches.set(symbol, cache);
    }
    cache.set(barIndex, value);
  }

  has(symbol: string, barIndex: number): boolean {
    return this.caches.get(symbol)?.has(barIndex) ?? false;
  }

  clear(): void {
    this.caches.clear();
  }

  get stats() {
    let totalHits = 0;
    let totalMisses = 0;
    let totalSize = 0;

    for (const cache of this.caches.values()) {
      const s = cache.stats;
      totalHits += s.hits;
      totalMisses += s.misses;
      totalSize += s.size;
    }

    return {
      symbolCount: this.caches.size,
      totalSize,
      totalHits,
      totalMisses,
      hitRate: totalHits + totalMisses > 0 ? (totalHits / (totalHits + totalMisses)) * 100 : 0,
    };
  }
}

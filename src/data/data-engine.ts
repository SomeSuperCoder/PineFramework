import type { Bar } from './bar.js';
import { validateBar } from './bar.js';

export interface DataEngineOptions {
  maxBarsPerSymbol?: number;
  cacheSize?: number;
  enableValidation?: boolean;
}

interface CacheEntry {
  bars: Bar[];
  lastAccess: number;
}

export class DataEngine {
  private data: Map<string, Map<string, Bar[]>>;
  private cache: Map<string, CacheEntry>;
  private maxBarsPerSymbol: number;
  private cacheSize: number;
  private enableValidation: boolean;

  constructor(options: DataEngineOptions = {}) {
    this.data = new Map();
    this.cache = new Map();
    this.maxBarsPerSymbol = options.maxBarsPerSymbol ?? 10_000_000;
    this.cacheSize = options.cacheSize ?? 1000;
    this.enableValidation = options.enableValidation ?? true;
  }

  private getKey(symbol: string, timeframe: string): string {
    return `${symbol}:${timeframe}`;
  }

  addBars(symbol: string, timeframe: string, bars: Bar[]): void {
    if (!this.data.has(symbol)) {
      this.data.set(symbol, new Map());
    }

    const symbolData = this.data.get(symbol)!;
    if (!symbolData.has(timeframe)) {
      symbolData.set(timeframe, []);
    }

    const existingBars = symbolData.get(timeframe)!;

    if (this.enableValidation) {
      for (const bar of bars) {
        if (!validateBar(bar)) {
          throw new Error(`Invalid bar data at timestamp ${bar.timestamp}`);
        }
      }
    }

    const filteredBars = this.deduplicate(existingBars, bars);
    const mergedBars = this.merge(existingBars, filteredBars);

    if (mergedBars.length > this.maxBarsPerSymbol) {
      symbolData.set(timeframe, mergedBars.slice(mergedBars.length - this.maxBarsPerSymbol));
    } else {
      symbolData.set(timeframe, mergedBars);
    }

    this.invalidateCache(symbol, timeframe);
  }

  private deduplicate(existing: Bar[], newBars: Bar[]): Bar[] {
    if (existing.length === 0) return newBars;

    const lastExisting = existing[existing.length - 1]!;
    return newBars.filter((bar) => bar.timestamp > lastExisting.timestamp);
  }

  private merge(existing: Bar[], newBars: Bar[]): Bar[] {
    const result = [...existing];
    for (const bar of newBars) {
      const lastIndex = result.length - 1;
      if (lastIndex >= 0 && result[lastIndex]!.timestamp === bar.timestamp) {
        result[lastIndex] = bar;
      } else {
        result.push(bar);
      }
    }
    return result;
  }

  private invalidateCache(symbol: string, timeframe: string): void {
    const prefix = `${symbol}:${timeframe}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  getBars(symbol: string, timeframe: string, start?: number, end?: number): Bar[] {
    const key = this.getKey(symbol, timeframe);

    const cacheKey = `${key}:${start ?? ''}:${end ?? ''}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      cached.lastAccess = Date.now();
      return cached.bars;
    }

    const symbolData = this.data.get(symbol);
    if (!symbolData) return [];

    const bars = symbolData.get(timeframe);
    if (!bars) return [];

    let result: Bar[];

    if (start !== undefined && end !== undefined) {
      result = bars.filter((bar) => bar.timestamp >= start && bar.timestamp <= end);
    } else if (start !== undefined) {
      result = bars.filter((bar) => bar.timestamp >= start);
    } else if (end !== undefined) {
      result = bars.filter((bar) => bar.timestamp <= end);
    } else {
      result = [...bars];
    }

    this.addToCache(cacheKey, result);
    return result;
  }

  private addToCache(key: string, bars: Bar[]): void {
    if (this.cache.size >= this.cacheSize) {
      let oldestKey: string | null = null;
      let oldestAccess = Infinity;

      for (const [k, entry] of this.cache) {
        if (entry.lastAccess < oldestAccess) {
          oldestAccess = entry.lastAccess;
          oldestKey = k;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { bars, lastAccess: Date.now() });
  }

  getBarCount(symbol: string, timeframe: string): number {
    const symbolData = this.data.get(symbol);
    if (!symbolData) return 0;

    const bars = symbolData.get(timeframe);
    return bars?.length ?? 0;
  }

  getLatestBar(symbol: string, timeframe: string): Bar | undefined {
    const symbolData = this.data.get(symbol);
    if (!symbolData) return undefined;

    const bars = symbolData.get(timeframe);
    if (!bars || bars.length === 0) return undefined;

    return bars[bars.length - 1];
  }

  getOldestBar(symbol: string, timeframe: string): Bar | undefined {
    const symbolData = this.data.get(symbol);
    if (!symbolData) return undefined;

    const bars = symbolData.get(timeframe);
    if (!bars || bars.length === 0) return undefined;

    return bars[0];
  }

  hasData(symbol: string, timeframe: string): boolean {
    const symbolData = this.data.get(symbol);
    if (!symbolData) return false;

    const bars = symbolData.get(timeframe);
    return !!bars && bars.length > 0;
  }

  getSymbols(): string[] {
    return Array.from(this.data.keys());
  }

  getTimeframes(symbol: string): string[] {
    const symbolData = this.data.get(symbol);
    if (!symbolData) return [];

    return Array.from(symbolData.keys());
  }

  clear(symbol?: string, timeframe?: string): void {
    if (symbol && timeframe) {
      const symbolData = this.data.get(symbol);
      if (symbolData) {
        symbolData.delete(timeframe);
        if (symbolData.size === 0) {
          this.data.delete(symbol);
        }
      }
      this.invalidateCache(symbol, timeframe);
    } else if (symbol) {
      this.data.delete(symbol);
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${symbol}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.data.clear();
      this.cache.clear();
    }
  }

  getMemoryEstimate(): { bars: number; cacheSize: number; estimatedBytes: number } {
    let totalBars = 0;
    for (const symbolData of this.data.values()) {
      for (const bars of symbolData.values()) {
        totalBars += bars.length;
      }
    }

    const bytesPerBar = 48;
    const estimatedBytes = totalBars * bytesPerBar;

    return {
      bars: totalBars,
      cacheSize: this.cache.size,
      estimatedBytes,
    };
  }
}

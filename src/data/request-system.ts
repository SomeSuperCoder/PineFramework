import type { Bar } from './bar.js';
import { parseTimeframe, areTimeframesCompatible } from './bar.js';
import type { DataEngine } from './data-engine.js';

export interface RequestSecurityOptions {
  lookahead?: boolean;
  gaps?: boolean;
  session?: string;
}

export interface DataSource {
  fetchBars(symbol: string, timeframe: string, start: number, end: number): Promise<Bar[]>;
}

export class RequestSystem {
  private dataEngine: DataEngine;
  private dataSources: Map<string, DataSource>;
  private requestCache: Map<string, Promise<Bar[]>>;
  private maxCacheAge: number;

  constructor(dataEngine: DataEngine, maxCacheAge: number = 60_000) {
    this.dataEngine = dataEngine;
    this.dataSources = new Map();
    this.requestCache = new Map();
    this.maxCacheAge = maxCacheAge;
  }

  registerDataSource(name: string, source: DataSource): void {
    this.dataSources.set(name, source);
  }

  removeDataSource(name: string): void {
    this.dataSources.delete(name);
  }

  async requestSecurity(
    symbol: string,
    timeframe: string,
    expression: (bar: Bar) => number,
    options: RequestSecurityOptions = {},
  ): Promise<number[]> {
    const bars = await this.fetchData(symbol, timeframe, options);

    if (bars.length === 0) {
      return [];
    }

    return bars.map(expression);
  }

  async requestSecurityClose(
    symbol: string,
    timeframe: string,
    options: RequestSecurityOptions = {},
  ): Promise<number[]> {
    const bars = await this.fetchData(symbol, timeframe, options);
    return bars.map((bar) => bar.close);
  }

  async requestSecurityOpen(
    symbol: string,
    timeframe: string,
    options: RequestSecurityOptions = {},
  ): Promise<number[]> {
    const bars = await this.fetchData(symbol, timeframe, options);
    return bars.map((bar) => bar.open);
  }

  async requestSecurityHigh(
    symbol: string,
    timeframe: string,
    options: RequestSecurityOptions = {},
  ): Promise<number[]> {
    const bars = await this.fetchData(symbol, timeframe, options);
    return bars.map((bar) => bar.high);
  }

  async requestSecurityLow(
    symbol: string,
    timeframe: string,
    options: RequestSecurityOptions = {},
  ): Promise<number[]> {
    const bars = await this.fetchData(symbol, timeframe, options);
    return bars.map((bar) => bar.low);
  }

  async requestSecurityVolume(
    symbol: string,
    timeframe: string,
    options: RequestSecurityOptions = {},
  ): Promise<number[]> {
    const bars = await this.fetchData(symbol, timeframe, options);
    return bars.map((bar) => bar.volume);
  }

  private async fetchData(
    symbol: string,
    timeframe: string,
    options: RequestSecurityOptions,
  ): Promise<Bar[]> {
    const cacheKey = `${symbol}:${timeframe}:${options.lookahead ?? false}:${options.gaps ?? false}`;

    const cached = this.requestCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const promise = this.fetchFromSource(symbol, timeframe, options);
    this.requestCache.set(cacheKey, promise);

    setTimeout(() => {
      this.requestCache.delete(cacheKey);
    }, this.maxCacheAge);

    return promise;
  }

  private async fetchFromSource(
    symbol: string,
    timeframe: string,
    options: RequestSecurityOptions,
  ): Promise<Bar[]> {
    const existingBars = this.dataEngine.getBars(symbol, timeframe);
    if (existingBars.length > 0 && !options.gaps) {
      return existingBars;
    }

    const now = Date.now();
    const timeframeMs = parseTimeframe(timeframe);
    const lookback = Math.max(existingBars.length * timeframeMs, 30 * 24 * 60 * 60 * 1000);
    const start = now - lookback;

    for (const [, source] of this.dataSources) {
      try {
        const bars = await source.fetchBars(symbol, timeframe, start, now);
        if (bars.length > 0) {
          this.dataEngine.addBars(symbol, timeframe, bars);
          return this.dataEngine.getBars(symbol, timeframe);
        }
      } catch {
        continue;
      }
    }

    return existingBars;
  }

  alignData(sourceBars: Bar[], targetTimeframe: string): Bar[] {
    if (sourceBars.length === 0) return [];

    const sourceTimeframe = this.inferTimeframe(sourceBars);
    if (!sourceTimeframe) return sourceBars;

    if (!areTimeframesCompatible(sourceTimeframe, targetTimeframe)) {
      return sourceBars;
    }

    const sourceMs = parseTimeframe(sourceTimeframe);
    const targetMs = parseTimeframe(targetTimeframe);

    if (targetMs > sourceMs) {
      return this.aggregateBars(sourceBars, sourceMs, targetMs);
    } else {
      return this.interpolateBars(sourceBars, sourceMs, targetMs);
    }
  }

  private inferTimeframe(bars: Bar[]): string | null {
    if (bars.length < 2) return null;

    const diffs: number[] = [];
    for (let i = 1; i < Math.min(bars.length, 10); i++) {
      diffs.push(bars[i]!.timestamp - bars[i - 1]!.timestamp);
    }

    const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;

    const timeframes = ['1', '5', '15', '30', '60', '120', '240', 'D', 'W', 'M'];
    for (const tf of timeframes) {
      const tfMs = parseTimeframe(tf);
      if (Math.abs(avgDiff - tfMs) < tfMs * 0.1) {
        return tf;
      }
    }

    return null;
  }

  private aggregateBars(bars: Bar[], sourceMs: number, targetMs: number): Bar[] {
    const ratio = Math.round(targetMs / sourceMs);
    const result: Bar[] = [];

    for (let i = 0; i < bars.length; i += ratio) {
      const chunk = bars.slice(i, i + ratio);
      if (chunk.length === 0) continue;

      result.push({
        timestamp: chunk[0]!.timestamp,
        open: chunk[0]!.open,
        high: Math.max(...chunk.map((b) => b.high)),
        low: Math.min(...chunk.map((b) => b.low)),
        close: chunk[chunk.length - 1]!.close,
        volume: chunk.reduce((sum, b) => sum + b.volume, 0),
      });
    }

    return result;
  }

  private interpolateBars(bars: Bar[], sourceMs: number, targetMs: number): Bar[] {
    const ratio = Math.round(sourceMs / targetMs);
    const result: Bar[] = [];

    for (const bar of bars) {
      const step = (bar.high - bar.low) / ratio;
      for (let i = 0; i < ratio; i++) {
        const timestamp = bar.timestamp + i * targetMs;
        const price = bar.low + step * i;
        result.push({
          timestamp,
          open: i === 0 ? bar.open : price,
          high: price + step * 0.5,
          low: price,
          close: i === ratio - 1 ? bar.close : price + step,
          volume: bar.volume / ratio,
        });
      }
    }

    return result;
  }

  clearCache(): void {
    this.requestCache.clear();
  }

  getCacheStats(): { size: number; maxAge: number } {
    return {
      size: this.requestCache.size,
      maxAge: this.maxCacheAge,
    };
  }
}

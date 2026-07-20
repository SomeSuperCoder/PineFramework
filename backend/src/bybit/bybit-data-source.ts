import type { Bar } from 'pine-framework';
import { RateLimiter } from './rate-limiter.js';
import { validateBybitUrl } from '../utils/security.js';

const BYBIT_REST_BASE = (() => {
  const url = process.env.BYBIT_REST_URL || 'https://api.bybit.com';
  validateBybitUrl(url, 'BYBIT_REST_URL');
  return url;
})();

export class BybitDataSource {
  private rateLimiter: RateLimiter;

  constructor(rateLimiter?: RateLimiter) {
    this.rateLimiter = rateLimiter || new RateLimiter(100, 1000);
  }

  async fetchBars(symbol: string, timeframe: string, start: number, end: number): Promise<Bar[]> {
    await this.rateLimiter.acquire();
    const limit = Math.min(Math.ceil((end - start) / this.intervalToMs(timeframe)) + 1, 1000);
    const url = `${BYBIT_REST_BASE}/v5/market/kline?category=linear&symbol=${symbol}&interval=${timeframe}&limit=${limit}`;
    const response = await fetch(url);
    const json = await response.json() as {
      retCode: number;
      retMsg: string;
      result: { list: string[][] };
    };
    if (json.retCode !== 0) {
      throw new Error(`Bybit API error: ${json.retMsg}`);
    }
    return json.result.list
      .map((row) => ({
        timestamp: parseInt(row[0], 10),
        open: parseFloat(row[1]),
        high: parseFloat(row[2]),
        low: parseFloat(row[3]),
        close: parseFloat(row[4]),
        volume: parseFloat(row[5]),
      }))
      .filter((bar) => bar.timestamp >= start && bar.timestamp <= end)
      .reverse();
  }

  private intervalToMs(interval: string): number {
    const map: Record<string, number> = {
      '1': 60_000,
      '3': 180_000,
      '5': 300_000,
      '15': 900_000,
      '30': 1_800_000,
      '60': 3_600_000,
      '120': 7_200_000,
      '240': 14_400_000,
      'D': 86_400_000,
      'W': 604_800_000,
      'M': 2_592_000_000,
    };
    return map[interval] || 60_000;
  }
}

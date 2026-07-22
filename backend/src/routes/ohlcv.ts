import { Router } from 'express';
import type { Bar } from 'pine-framework';
import type { OHLCVCache } from '../cache/ohlcv-cache.js';
import type { DiskOHLCVCache } from '../cache/DiskOHLCVCache.js';

const BYBIT_REST_BASE = process.env.BYBIT_REST_URL || 'https://api.bybit.com';

const VALID_INTERVALS = ['1', '3', '5', '15', '30', '60', '120', '240', 'D', 'W', 'M'];
const VALID_SYMBOLS = /^[A-Z0-9]{1,20}$/;

export function createOHLCVRouter(cache: OHLCVCache, diskCache?: DiskOHLCVCache): Router {
  const router = Router();

  router.get('/ohlcv', async (req, res) => {
    try {
      const symbol = (req.query.symbol as string)?.toUpperCase();
      const interval = req.query.interval as string;
      const limit = Math.min(parseInt(req.query.limit as string) || 1000, 1000);
      const end = req.query.end ? parseInt(req.query.end as string, 10) : undefined;

      if (!symbol || !VALID_SYMBOLS.test(symbol)) {
        res.status(400).json({ error: 'Invalid symbol format' });
        return;
      }
      if (!interval || !VALID_INTERVALS.includes(interval)) {
        res.status(400).json({ error: `Invalid interval. Valid: ${VALID_INTERVALS.join(', ')}` });
        return;
      }

      // L1: in-memory cache (only for non-paginated recent-bar requests)
      if (!end) {
        const cached = cache.get(symbol, interval);
        if (cached && cached.length >= limit) {
          res.json({ symbol, interval, data: cached.slice(-limit) });
          return;
        }
      }

      // L2: disk cache — checked for ALL requests (including paginated scroll-back)
      if (diskCache && !diskCache.isStale(symbol, interval)) {
        const diskBars = diskCache.get(symbol, interval, undefined, end ?? undefined);
        if (diskBars && diskBars.length > 0) {
          const result = diskBars.slice(-limit);
          // Warm L1 from L2 for subsequent non-paginated requests
          if (!end) cache.set(symbol, interval, diskBars);
          // Determine hasMore: if the oldest returned bar is not the oldest
          // in cache, there are more cached bars further back.
          const oldestReturned = result[0]?.timestamp;
          const oldestOnDisk = diskBars[0]?.timestamp;
          const hasMore = oldestReturned !== undefined && oldestOnDisk !== undefined
            ? oldestReturned > oldestOnDisk || result.length >= limit
            : result.length >= limit;
          res.json({ symbol, interval, data: result, hasMore });
          return;
        }
      }

      // L3: Bybit API
      let url = `${BYBIT_REST_BASE}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`;
      if (end) {
        url += `&end=${end}`;
      }
      const response = await fetch(url);
      const json = await response.json() as {
        retCode: number;
        retMsg: string;
        result: { list: string[][] };
      };

      if (json.retCode !== 0) {
        res.status(502).json({ error: `Bybit API error: ${json.retMsg}` });
        return;
      }

      const bars: Bar[] = json.result.list.map((row) => ({
        timestamp: parseInt(row[0], 10),
        open: parseFloat(row[1]),
        high: parseFloat(row[2]),
        low: parseFloat(row[3]),
        close: parseFloat(row[4]),
        volume: parseFloat(row[5]),
      })).reverse();

      // Write back to BOTH caches (always, even for paginated responses)
      cache.set(symbol, interval, bars);
      if (diskCache) {
        diskCache.set(symbol, interval, bars).catch((err) =>
          console.error('[OHLCV] Disk cache write error:', err),
        );
      }
      res.json({ symbol, interval, data: bars, hasMore: bars.length === limit });
    } catch (err) {
      console.error('[OHLCV] Error:', err);
      res.status(500).json({ error: 'Failed to fetch OHLCV data' });
    }
  });

  return router;
}

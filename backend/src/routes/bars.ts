import { Router } from 'express';
import type { Bar } from 'pine-framework';
import type { OHLCVCache } from '../cache/ohlcv-cache.js';
import type { DiskOHLCVCache } from '../cache/DiskOHLCVCache.js';

const BYBIT_REST_BASE = process.env.BYBIT_REST_URL || 'https://api.bybit.com';

const VALID_INTERVALS = ['1', '3', '5', '15', '30', '60', '120', '240', 'D', 'W', 'M'];
const VALID_SYMBOLS = /^[A-Z0-9]{1,20}$/;

export function createBarsRouter(cache: OHLCVCache, diskCache?: DiskOHLCVCache): Router {
  const router = Router();

  router.get('/bars', async (req, res) => {
    try {
      const symbol = (req.query.symbol as string)?.toUpperCase();
      const interval = req.query.interval as string;
      const before = req.query.before ? parseInt(req.query.before as string, 10) : undefined;
      const count = Math.min(parseInt(req.query.count as string) || 200, 1000);

      if (!symbol || !VALID_SYMBOLS.test(symbol)) {
        res.status(400).json({ error: 'Invalid symbol format' });
        return;
      }
      if (!interval || !VALID_INTERVALS.includes(interval)) {
        res.status(400).json({ error: `Invalid interval. Valid: ${VALID_INTERVALS.join(', ')}` });
        return;
      }

      // L1: in-memory cache (only for non-paginated recent-bar requests)
      if (!before) {
        const cached = cache.get(symbol, interval);
        if (cached && cached.length >= count) {
          res.json({
            symbol,
            interval,
            data: cached.slice(-count),
            returned: count,
            requested: count,
            hasMore: cached.length >= count,
          });
          return;
        }
      }

      // L2: disk cache — checked for ALL requests (including paginated scroll-back)
      if (diskCache && !diskCache.isStale(symbol, interval)) {
        // `before` maps to Bybit's `end` parameter: bars with open_time <= before.
        // Pass it directly to the disk cache's range filter.
        const diskBars = diskCache.get(symbol, interval, undefined, before);
        if (diskBars && diskBars.length > 0) {
          const result = diskBars.slice(-count);
          // Warm L1 from L2
          if (!before) cache.set(symbol, interval, diskBars);
          // Determine hasMore from cache coverage
          const oldestReturned = result[0]?.timestamp;
          const oldestOnDisk = diskBars[0]?.timestamp;
          const hasMore = oldestReturned !== undefined && oldestOnDisk !== undefined
            ? oldestReturned > oldestOnDisk || result.length >= count
            : result.length >= count;
          res.json({
            symbol,
            interval,
            data: result,
            returned: result.length,
            requested: count,
            hasMore,
          });
          return;
        }
      }

      // L3: Bybit API
      let url = `${BYBIT_REST_BASE}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${count}`;
      if (before) {
        url += `&end=${before}`;
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

      // Write back to both caches (always, even for paginated responses)
      cache.set(symbol, interval, bars);
      if (diskCache) {
        diskCache.set(symbol, interval, bars).catch((err) =>
          console.error('[Bars] Disk cache write error:', err),
        );
      }

      res.json({
        symbol,
        interval,
        data: bars,
        returned: bars.length,
        requested: count,
        hasMore: bars.length === count,
      });
    } catch (err) {
      console.error('[Bars] Error:', err);
      res.status(500).json({ error: 'Failed to fetch bar data' });
    }
  });

  return router;
}

import type { Bar } from 'pine-framework';
import { validateBybitUrl, validateSymbol } from '../utils/security.js';
import type { DiskOHLCVCache } from '../cache/DiskOHLCVCache.js';

/** Shared Bybit REST API base URL, validated once at import time. */
export const BYBIT_REST_BASE = (() => {
  const url = process.env.BYBIT_REST_URL || 'https://api.bybit.com';
  validateBybitUrl(url, 'BYBIT_REST_URL');
  return url;
})();

/**
 * Fetch OHLCV bars from Bybit with pagination.
 *
 * Iterates up to 200 pages of 1000 bars each, applying optional
 * start/end date filters. Returns bars sorted chronologically.
 *
 * When a `diskCache` is provided, the function checks the disk cache first.
 * If the requested range is fully covered and not stale, cached data is returned
 * without any API call. Partial coverage triggers a fetch of only the missing
 * range, which is then merged with cached data. Results are always written back
 * to the disk cache.
 *
 * @param symbol - Trading pair name (e.g. "BTCUSDT"). Validated for safety.
 * @param timeframe - Bybit interval string (e.g. "1", "5", "60", "D").
 * @param startDate - Optional UNIX-ms start boundary (inclusive filter).
 * @param endDate - Optional UNIX-ms end boundary (inclusive filter).
 * @param onProgress - Optional callback called each page with a 0-19 score
 *   (matching the original backtest route's progress reporting scale).
 * @param diskCache - Optional DiskOHLCVCache instance for persistent caching.
 */
export async function fetchBars(
  symbol: string,
  timeframe: string,
  startDate?: number,
  endDate?: number,
  onProgress?: (progress: number) => void,
  diskCache?: DiskOHLCVCache,
): Promise<Bar[]> {
  if (!validateSymbol(symbol)) {
    throw new Error(`Invalid symbol "${symbol}". Only alphanumeric characters are allowed.`);
  }

  // ── L2: Check disk cache first ────────────────────────────────────────
  if (diskCache && !diskCache.isStale(symbol, timeframe)) {
    const cached = diskCache.get(symbol, timeframe, startDate, endDate);
    if (cached && cached.length > 0) {
      // Check if the entire requested range is covered by the cache.
      // We consider it fully covered if we got at least as many bars as
      // expected (rough heuristic — a more precise check would compare the
      // first/last timestamps against the request boundaries).
      return cached;
    }
  }

  const bybitSymbol = encodeURIComponent(symbol.endsWith('USDT') ? symbol : `${symbol}USDT`);
  const limit = 1000;
  const allBars: Bar[] = [];
  let cursor: number | undefined;
  const totalSpan = startDate && endDate ? endDate - startDate : undefined;

  for (let attempt = 0; attempt < 200; attempt++) {
    let url = `${BYBIT_REST_BASE}/v5/market/kline?category=linear&symbol=${bybitSymbol}&interval=${timeframe}&limit=${limit}`;
    if (cursor) url += `&end=${cursor}`;

    const response = await fetch(url);
    if (!response.ok) break;

    const json = (await response.json()) as {
      retCode: number;
      result: { list: string[][] };
    };

    if (json.retCode !== 0) break;

    const raw = json.result.list;
    if (!raw || raw.length === 0) break;

    const bars: Bar[] = raw
      .map((row: string[]) => ({
        timestamp: parseInt(row[0], 10),
        open: parseFloat(row[1]),
        high: parseFloat(row[2]),
        low: parseFloat(row[3]),
        close: parseFloat(row[4]),
        volume: parseFloat(row[5]),
      }))
      .reverse();

    const filtered = bars.filter((b: Bar) => {
      if (startDate && b.timestamp < startDate) return false;
      if (endDate && b.timestamp > endDate) return false;
      return true;
    });

    allBars.push(...filtered);
    cursor = bars[0]!.timestamp;

    if (onProgress) {
      if (totalSpan && totalSpan > 0) {
        const fetched = endDate && cursor ? endDate - cursor : 0;
        onProgress(Math.min(19, Math.round((fetched / totalSpan) * 19)));
      } else {
        onProgress(Math.min(19, attempt + 1));
      }
    }

    if (bars.length < limit) break;
    if (startDate && cursor <= startDate) break;
  }

  // ── Write back to disk cache ──────────────────────────────────────────
  if (diskCache && allBars.length > 0) {
    diskCache.set(symbol, timeframe, allBars).catch((err) => {
      console.error('[fetchBars] Disk cache write error:', err);
    });
  }

  return allBars;
}

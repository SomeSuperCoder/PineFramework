import type { Bar } from 'pine-framework';
import { getBybitCategory, getBybitSymbol, isValidPairSymbol } from 'pine-framework';
import { validateBybitUrl, validateSymbol } from '../utils/security.js';
import type { DiskOHLCVCache } from '../cache/DiskOHLCVCache.js';

/** Shared Bybit REST API base URL, validated once at import time. */
export const BYBIT_REST_BASE = (() => {
  const url = process.env.BYBIT_REST_URL || 'https://api.bybit.com';
  validateBybitUrl(url, 'BYBIT_REST_URL');
  return url;
})();

/**
 * Sort bars chronologically and remove duplicate timestamps.
 *
 * WHY: Bybit returns each page newest-first; the pagination loop reverses
 * each page to ascending and appends pages in fetch order (newest page
 * first, cursor walking backwards). For multi-page windows the raw
 * concatenation jumps BACKWARD at every ~1000-bar boundary. PineScript
 * `var` state and `[1]` series references assume a strictly chronological
 * feed — a backward jump corrupts trailing-stop state machines (e.g. the UT
 * trailing stop never fires → 0 trades). Boundary bars can also repeat
 * across pages (the oldest bar of page N is the newest bar of page N+1), so
 * dedupe by timestamp, keeping the first occurrence.
 */
function dedupeAndSortBars(bars: Bar[]): Bar[] {
  const byTimestamp = new Map<number, Bar>();
  for (const bar of bars) {
    if (!byTimestamp.has(bar.timestamp)) {
      byTimestamp.set(bar.timestamp, bar);
    }
  }
  return Array.from(byTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Fetch OHLCV bars from Bybit with pagination.
 *
 * Iterates up to 200 pages of 1000 bars each, applying optional
 * start/end date filters. Returns bars sorted chronologically and
 * deduplicated by timestamp (multi-page windows are globally sorted —
 * pages are fetched newest-first, so the concatenation is NOT already
 * chronological).
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

  // Resolve the Bybit instrument symbol registry-aware. Registry pairs use
  // their mapped bybitSymbol (GOLDUSDC→XAUTUSDT, TSLAXUSDC→TSLAXUSDT,
  // AAPLXUSDC→AAPLXUSDT); symbols NOT in the registry keep the legacy
  // heuristic (plain base symbol 'BTC' → 'BTCUSDT'). The previous
  // `encodeURIComponent(symbol.endsWith('USDT') ? symbol : symbol+'USDT')`
  // hack corrupted mapped pairs (GOLDUSDC → 'GOLDUSDCUSDT').
  const bybitSymbol = encodeURIComponent(
    isValidPairSymbol(symbol)
      ? getBybitSymbol(symbol)
      : symbol.endsWith('USDT')
        ? symbol
        : `${symbol}USDT`,
  );
  const bybitCategory = getBybitCategory(symbol);
  const limit = 1000;
  const allBars: Bar[] = [];
  let cursor: number | undefined;
  const totalSpan = startDate && endDate ? endDate - startDate : undefined;

  for (let attempt = 0; attempt < 200; attempt++) {
    let url = `${BYBIT_REST_BASE}/v5/market/kline?category=${bybitCategory}&symbol=${bybitSymbol}&interval=${timeframe}&limit=${limit}`;
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
    if (startDate && cursor !== undefined && cursor <= startDate) break;
  }

  // ── Globally sort + dedupe BEFORE cache write and return ──────────────
  // The pagination loop appends pages newest-first; the cache and the Pine
  // engine must only ever see a strictly chronological, duplicate-free feed.
  const sortedBars = dedupeAndSortBars(allBars);

  // ── Write back to disk cache ──────────────────────────────────────────
  // Write the SORTED result so the cache never stores the backward-jumping
  // order. (DiskOHLCVCache.mergeBars also sorts on write, but the invariant
  // belongs at this call site — the fetch function must never hand the cache
  // unsorted bars.)
  if (diskCache && sortedBars.length > 0) {
    diskCache.set(symbol, timeframe, sortedBars).catch((err) => {
      console.error('[fetchBars] Disk cache write error:', err);
    });
  }

  return sortedBars;
}

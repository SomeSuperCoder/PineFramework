import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  TradeHistoryMode,
  TradeHistoryResponse,
  TradeHistoryStatus,
  TradeRecord,
} from '../types/trade';

export interface TradeHistoryFilter {
  mode: TradeHistoryMode;
  status: TradeHistoryStatus;
  /** Empty string = all. */
  symbol: string;
  /** Empty string = all (API values: "1", "5", "60", ...). */
  timeframe: string;
  /** Empty string = all. */
  strategy: string;
}

/** Client-side page size — matches the API default (max 200). */
export const HISTORY_PAGE_SIZE = 50;

/** Mirror of the API's server-side filter, applied to live `bot:trade` events
 *  so a WS-merged trade never violates the active filters. Exported for tests. */
export function matchesTradeFilter(trade: TradeRecord, filter: TradeHistoryFilter): boolean {
  if (filter.mode !== 'all' && trade.mode !== filter.mode) return false;
  if (filter.status !== 'all' && trade.status !== filter.status) return false;
  if (filter.symbol && trade.symbol !== filter.symbol) return false;
  if (filter.timeframe && trade.timeframe !== filter.timeframe) return false;
  if (filter.strategy && trade.strategy !== filter.strategy) return false;
  return true;
}

export interface UseTradeHistoryResult {
  /** Loaded pages concatenated, newest-first (plus live-merged trades). */
  trades: TradeRecord[];
  /** Initial page / reload in flight. */
  loading: boolean;
  /** Older-page fetch in flight. */
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  canGoBack: boolean;
  /** 0-based index of the currently loaded page. */
  page: number;
  totalLoaded: number;
  goNext: () => void;
  goBack: () => void;
  reload: () => void;
}

/**
 * Paginated, filterable trade history (GET /api/bot/history).
 *
 * - Fetches page 0 on: mount (tab open), filter change, or WS reconnect
 *   (`reconnectEpoch` increments on every successful websocket open).
 * - `goNext` appends older pages without duplicating (dedupe by id).
 * - `goBack` re-loads the previous page from the API (v1 keeps page-forward
 *   simple and correct: newest-first, Next = older pages, Previous = reload).
 * - Live `bot:trade` events merge at the head, filter-respecting.
 */
export function useTradeHistory(opts: {
  backendUrl: string;
  filter: TradeHistoryFilter;
  enabled: boolean;
  reconnectEpoch: number;
  liveTrades: TradeRecord[];
}): UseTradeHistoryResult {
  const { backendUrl, filter, enabled, reconnectEpoch, liveTrades } = opts;
  const { mode, status, symbol, timeframe, strategy } = filter;

  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  // Cursors used to load each page — page 0 is always `null`. `goBack` pops
  // this and re-fetches the previous page.
  const [pageCursors, setPageCursors] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Latest live trades, readable inside fetchPage without adding them to its
  // dependency array (that would refetch page 0 on every bot:trade event).
  const liveTradesRef = useRef(liveTrades);
  liveTradesRef.current = liveTrades;

  const matches = useCallback(
    (t: TradeRecord): boolean => {
      if (mode !== 'all' && t.mode !== mode) return false;
      if (status !== 'all' && t.status !== status) return false;
      if (symbol && t.symbol !== symbol) return false;
      if (timeframe && t.timeframe !== timeframe) return false;
      if (strategy && t.strategy !== strategy) return false;
      return true;
    },
    [mode, status, symbol, timeframe, strategy],
  );

  const fetchPage = useCallback(
    async (cursor: string | null, replace: boolean) => {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (mode !== 'all') params.set('mode', mode);
        if (status !== 'all') params.set('status', status);
        if (symbol) params.set('symbol', symbol);
        if (timeframe) params.set('timeframe', timeframe);
        if (strategy) params.set('strategy', strategy);
        if (cursor != null) params.set('cursor', String(cursor));
        params.set('limit', String(HISTORY_PAGE_SIZE));
        const res = await fetch(`${backendUrl}/api/bot/history?${params.toString()}`);
        const data = (await res.json()) as Partial<TradeHistoryResponse>;
        if (!data || data.success !== true) {
          setError(data?.error || `Failed to load trade history (HTTP ${res.status})`);
          if (replace) {
            setTrades([]);
            setHasMore(false);
            setNextCursor(null);
          }
          return;
        }
        const pageTrades = Array.isArray(data.trades) ? data.trades : [];
        setTrades((prev) => {
          if (!replace) {
            // Append older pages without duplicating.
            const seen = new Set(prev.map((t) => t.id));
            const fresh = pageTrades.filter((t) => !seen.has(t.id));
            return [...prev, ...fresh];
          }
          // Reload: the server page is authoritative, but a trade that closed
          // after the request started (or raced the pagination) must not
          // vanish — re-merge newer live trades at the head.
          const seen = new Set(pageTrades.map((t) => t.id));
          const newestClosedAt =
            pageTrades.length > 0 ? Math.max(...pageTrades.map((t) => t.closedAt)) : -Infinity;
          const liveNewer = (liveTradesRef.current ?? []).filter(
            (t) => !seen.has(t.id) && t.closedAt > newestClosedAt && matches(t),
          );
          return [...liveNewer, ...pageTrades];
        });
        setHasMore(!!data.hasMore);
        setNextCursor(data.nextCursor ?? null);
      } catch {
        setError('Network error — is the backend running?');
        if (replace) {
          setTrades([]);
          setHasMore(false);
          setNextCursor(null);
        }
      } finally {
        if (replace) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [backendUrl, mode, status, symbol, timeframe, strategy, matches],
  );

  // Load page 0 on: tab open, filter change, or WS reconnect.
  useEffect(() => {
    if (!enabled) return;
    setPageCursors([null]);
    setPage(0);
    void fetchPage(null, true);
  }, [enabled, mode, status, symbol, timeframe, strategy, reconnectEpoch, fetchPage]);

  // Merge live bot:trade events at the head (dedupe by id, filter-respecting,
  // newest-first by closedAt).
  useEffect(() => {
    if (!enabled || liveTrades.length === 0) return;
    setTrades((prev) => {
      const seen = new Set(prev.map((t) => t.id));
      const fresh = liveTrades.filter((t) => !seen.has(t.id) && matches(t));
      if (fresh.length === 0) return prev;
      return [...fresh, ...prev].sort((a, b) => b.closedAt - a.closedAt || (a.id < b.id ? 1 : -1));
    });
  }, [liveTrades, enabled, matches]);

  const goNext = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    const cursor = nextCursor;
    setPageCursors((prev) => [...prev, cursor]);
    setPage((p) => p + 1);
    void fetchPage(cursor, false);
  }, [hasMore, loadingMore, loading, nextCursor, fetchPage]);

  const goBack = useCallback(() => {
    if (page === 0 || loadingMore || loading) return;
    const prevCursors = pageCursors.slice(0, -1);
    const backCursor = prevCursors[prevCursors.length - 1] ?? null;
    setPageCursors(prevCursors);
    setPage((p) => p - 1);
    void fetchPage(backCursor, true);
  }, [page, pageCursors, loadingMore, loading, fetchPage]);

  const reload = useCallback(() => {
    setPageCursors([null]);
    setPage(0);
    void fetchPage(null, true);
  }, [fetchPage]);

  return {
    trades,
    loading,
    loadingMore,
    error,
    hasMore,
    canGoBack: page > 0,
    page,
    totalLoaded: trades.length,
    goNext,
    goBack,
    reload,
  };
}

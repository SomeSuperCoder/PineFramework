import { useCallback, useEffect, useState } from 'react';
import type {
  TradeGroupBy,
  TradeHistoryMode,
  TradeHistoryStatus,
  TradeRecord,
  TradeStats,
  TradeStatsGroup,
  TradeStatsResponse,
} from '../types/trade';

export interface UseTradeStatsResult {
  summary: TradeStats | null;
  groups: TradeStatsGroup[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Global + grouped trading statistics (GET /api/bot/stats).
 *
 * - Fetches on: mount (tab open), mode/status/groupBy change, or WS reconnect
 *   (`reconnectEpoch`).
 * - `groupBy=global` returns `groups: null`; the summary is always the global
 *   summary over the filtered set, so one fetch serves both the metric cards
 *   and the grouped comparison chart.
 * - Live `bot:trade` events trigger a debounced refetch so stats move without
 *   a manual reload (spec: live update without full page reload).
 */
export function useTradeStats(opts: {
  backendUrl: string;
  mode: TradeHistoryMode;
  status: TradeHistoryStatus;
  groupBy: TradeGroupBy;
  enabled: boolean;
  reconnectEpoch: number;
  liveTrades: TradeRecord[];
}): UseTradeStatsResult {
  const { backendUrl, mode, status, groupBy, enabled, reconnectEpoch, liveTrades } = opts;
  const [summary, setSummary] = useState<TradeStats | null>(null);
  const [groups, setGroups] = useState<TradeStatsGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('groupBy', groupBy);
    if (mode !== 'all') params.set('mode', mode);
    if (status !== 'all') params.set('status', status);
    fetch(`${backendUrl}/api/bot/stats?${params.toString()}`)
      .then((res) => res.json())
      .then((data: Partial<TradeStatsResponse>) => {
        if (cancelled) return;
        if (!data || data.success !== true) {
          setSummary(null);
          setGroups(null);
          setError(data?.error || 'Failed to load statistics');
          return;
        }
        setSummary(data.summary ?? null);
        setGroups(Array.isArray(data.groups) ? data.groups : null);
      })
      .catch(() => {
        if (cancelled) return;
        setSummary(null);
        setGroups(null);
        setError('Network error — is the backend running?');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [backendUrl, enabled, mode, status, groupBy, reconnectEpoch, refreshTick]);

  // Live update: a new closed trade while the stats tab is open refetches
  // (debounced) so the cards + charts reflect it without a manual reload.
  const latestLiveTradeId = liveTrades.length > 0 ? liveTrades[liveTrades.length - 1].id : null;
  useEffect(() => {
    if (!enabled || !latestLiveTradeId) return;
    const t = setTimeout(refresh, 600);
    return () => clearTimeout(t);
  }, [latestLiveTradeId, enabled, refresh]);

  return { summary, groups, loading, error, refresh };
}

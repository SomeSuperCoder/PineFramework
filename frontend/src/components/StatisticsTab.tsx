import { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, BarChart, Bar, Cell } from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import type {
  TradeGroupBy,
  TradeHistoryMode,
  TradeHistoryStatus,
  TradeHistoryResponse,
  TradeRecord,
  TradeStatsGroup,
} from '../types/trade';
import { useTradeStats } from '../hooks/useTradeStats';
import { matchesTradeFilter } from '../hooks/useTradeHistory';
import { fmtAmount, fmtSignedUsd } from '../utils/format';
import { ErrorState, ModeToggle, StatusSelect } from './TradeTabShared';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface StatisticsTabProps {
  backendUrl: string;
  liveTrades: TradeRecord[];
  reconnectEpoch: number;
}

/** Cumulative realized PnL over close time — pure, exported for tests.
 *  Input trades may be in any order; output is sorted ascending by closedAt
 *  with the running sum of realizedPnl. */
export function computeEquityCurve(trades: TradeRecord[]): Array<{ time: number; equity: number }> {
  const sorted = [...trades].sort((a, b) => a.closedAt - b.closedAt || (a.id < b.id ? -1 : 1));
  let equity = 0;
  const points: Array<{ time: number; equity: number }> = [];
  for (const t of sorted) {
    equity += t.realizedPnl;
    points.push({ time: t.closedAt, equity });
  }
  return points;
}

const GROUP_BY_LABEL: Record<Exclude<TradeGroupBy, 'global'>, string> = {
  strategy: 'Strategy',
  timeframe: 'Timeframe',
  asset: 'Asset',
};

/** Equity curve — Recharts AreaChart replacing the hand-rolled canvas. */
function EquityCurveChart({ points }: { points: Array<{ time: number; equity: number }> }) {
  if (points.length === 0) return null;

  const data = points.map((p) => ({
    time: new Date(p.time).toLocaleDateString(),
    equity: p.equity,
  }));

  return (
    <div className="w-full h-[220px]">
      <ChartContainer config={{ equity: { label: 'Equity', color: 'var(--color-primary)' } }}>
        <AreaChart data={data} margin={{ top: 16, right: 10, bottom: 8, left: 10 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border)" />
          <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${v}`} />
          <ReferenceLine y={0} stroke="var(--color-border)" strokeDasharray="4 4" />
          <ChartTooltipContent />
          <Area type="monotone" dataKey="equity" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.1} />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

/** Grouped PnL comparison — Recharts horizontal BarChart replacing the hand-rolled canvas. */
function GroupedPnlChart({ groups }: { groups: TradeStatsGroup[] }) {
  if (groups.length === 0) return null;

  const data = groups.map((g) => ({
    name: g.key.length > 24 ? `${g.key.slice(0, 24)}…` : g.key,
    pnl: g.stats.totalPnl,
  }));

  return (
    <div className="w-full max-h-[400px]">
      <ChartContainer config={{ pnl: { label: 'PnL', color: 'var(--color-primary)' } }}>
        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${v}`} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={150} />
          <ReferenceLine x={0} stroke="var(--color-border)" />
          <ChartTooltipContent />
          <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

const NO_TRADES = (
  <div className="p-8 text-center text-[12px] text-muted-foreground">
    No trades yet.
  </div>
);

/**
 * Statistics tab (design D6 / tasks 4.3-4.4): global metric cards, a
 * hand-rolled canvas equity curve (cumulative realized PnL over close time),
 * and a grouped total-PnL comparison chart per strategy / timeframe / asset.
 * Chaos mode surfaces as its own "Chaos Mode" strategy group (backend records
 * chaos closes with strategy: "Chaos Mode") and is excluded by live-only mode.
 */
export function StatisticsTab({ backendUrl, liveTrades, reconnectEpoch }: StatisticsTabProps) {
  const [mode, setMode] = useState<TradeHistoryMode>('all');
  const [status, setStatus] = useState<TradeHistoryStatus>('confirmed');
  const [groupBy, setGroupBy] = useState<Exclude<TradeGroupBy, 'global'>>('strategy');

  const stats = useTradeStats({
    backendUrl,
    mode,
    status,
    groupBy,
    enabled: true,
    reconnectEpoch,
    liveTrades,
  });

  // Equity-curve source: full paginated history (limit 200/page, capped) over
  // the same mode/status filter. Lives here (stats endpoint returns the summary,
  // not the curve — design D5 keeps maxDrawdown server-side but the chart needs
  // the ordered trade series).
  const [equityTrades, setEquityTrades] = useState<TradeRecord[]>([]);
  const [equityLoading, setEquityLoading] = useState(false);
  const [equityError, setEquityError] = useState<string | null>(null);
  const EQUITY_MAX_PAGES = 25; // 25 × 200 = 5,000 trades cap — plenty for v1.

  useEffect(() => {
    let cancelled = false;
    setEquityLoading(true);
    setEquityError(null);
    const seen = new Map<string, TradeRecord>();
    (async () => {
      let cursor: string | null = null;
      try {
        for (let i = 0; i < EQUITY_MAX_PAGES; i++) {
          const params = new URLSearchParams();
          if (mode !== 'all') params.set('mode', mode);
          if (status !== 'all') params.set('status', status);
          if (cursor != null) params.set('cursor', String(cursor));
          params.set('limit', '200');
          const res = await fetch(`${backendUrl}/api/bot/history?${params.toString()}`);
          const data = (await res.json()) as Partial<TradeHistoryResponse>;
          if (!data || data.success !== true) {
            if (!cancelled)
              setEquityError(data?.error || `Failed to load history (HTTP ${res.status})`);
            return;
          }
          const pageTrades = Array.isArray(data.trades) ? data.trades : [];
          for (const t of pageTrades) {
            if (!seen.has(t.id)) seen.set(t.id, t);
          }
          if (!data.hasMore || data.nextCursor == null) break;
          cursor = data.nextCursor;
        }
        if (!cancelled) setEquityTrades([...seen.values()]);
      } catch {
        if (!cancelled) setEquityError('Network error — is the backend running?');
      } finally {
        if (!cancelled) setEquityLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendUrl, mode, status, reconnectEpoch]);

  // Live-update the equity series from bot:trade events (filter-respecting)
  // without a full paginated refetch.
  useEffect(() => {
    if (liveTrades.length === 0) return;
    setEquityTrades((prev) => {
      const seen = new Set(prev.map((t) => t.id));
      const fresh = liveTrades.filter(
        (t) =>
          !seen.has(t.id) &&
          matchesTradeFilter(t, { mode, status, symbol: '', timeframe: '', strategy: '' }),
      );
      if (fresh.length === 0) return prev;
      return [...prev, ...fresh];
    });
  }, [liveTrades, mode, status]);

  const equityPoints = useMemo(() => computeEquityCurve(equityTrades), [equityTrades]);

  const { summary, groups, loading, error, refresh } = stats;

  const groupLabel = GROUP_BY_LABEL[groupBy];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex gap-2 items-center flex-wrap">
        <ModeToggle value={mode} onChange={setMode} />
        <StatusSelect value={status} onChange={setStatus} />
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          Group by:
        </span>
        <Select
          value={groupBy}
          onValueChange={(v) => setGroupBy(v as Exclude<TradeGroupBy, 'global'>)}
        >
          <SelectTrigger
            className="h-9"
            aria-label="Group the PnL comparison chart by strategy, timeframe, or asset"
            title="Group the PnL comparison chart by strategy, timeframe, or asset"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="strategy">Strategy</SelectItem>
            <SelectItem value="timeframe">Timeframe</SelectItem>
            <SelectItem value="asset">Asset</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Global metric cards */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Trade Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          {error && !summary ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : loading && !summary ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Loading statistics…
            </div>
          ) : summary && summary.totalTrades > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Total Trades</div>
                <div className="font-mono text-sm">{String(summary.totalTrades)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Win Rate</div>
                <div className="font-mono text-sm">{`${(summary.winRate * 100).toFixed(1)}%`}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Gross PnL</div>
                <div className="font-mono text-sm" title="Realized PnL before fees (expected-price based — estimate)">
                  {fmtSignedUsd(summary.totalPnl)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Net PnL</div>
                <div className="font-mono text-sm" title="Gross PnL minus fees (fees are 0 in this version — equals gross PnL)">
                  {fmtSignedUsd(summary.netPnl)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Fees</div>
                <div className="font-mono text-sm" title="Fees are not included in this version -- always 0 (real fee parsing deferred)">
                  {fmtAmount(summary.totalFees)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Profit Factor</div>
                <div className="font-mono text-sm">
                  {summary.profitFactor >= Number.MAX_SAFE_INTEGER
                    ? '∞'
                    : summary.profitFactor.toFixed(2)}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Avg Win</div>
                <div className="font-mono text-sm">{fmtSignedUsd(summary.averageWin)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Avg Loss</div>
                <div className="font-mono text-sm">{fmtSignedUsd(summary.averageLoss)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Best Trade</div>
                <div className="font-mono text-sm">{fmtSignedUsd(summary.bestTrade)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Worst Trade</div>
                <div className="font-mono text-sm">{fmtSignedUsd(summary.worstTrade)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Avg Trade</div>
                <div className="font-mono text-sm">{fmtSignedUsd(summary.avgTrade)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Max Drawdown</div>
                <div className="font-mono text-sm">{fmtAmount(summary.maxDrawdown)}</div>
              </div>
            </div>
          ) : (
            NO_TRADES
          )}
        </CardContent>
      </Card>

      {/* Equity curve */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Equity Curve{' '}
            <span className="text-xs font-normal text-muted-foreground">
              — cumulative realized PnL over close time (est.)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {equityError ? (
            <ErrorState message={equityError} />
          ) : equityLoading && equityTrades.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center rounded-md border bg-muted/20 text-sm text-muted-foreground">
              Loading equity curve…
            </div>
          ) : equityPoints.length === 0 ? (
            <div className="h-[100px] flex items-center justify-center rounded-md border bg-muted/20 text-sm text-muted-foreground">
              No trades to chart.
            </div>
          ) : (
            <EquityCurveChart points={equityPoints} />
          )}
        </CardContent>
      </Card>

      {/* Grouped PnL comparison */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">PnL by {groupLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          {error && !groups ? (
            <ErrorState message={error} onRetry={refresh} />
          ) : loading && !groups ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Loading groups…
            </div>
          ) : groups && groups.length > 0 ? (
            <GroupedPnlChart groups={groups} />
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No groups to chart.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
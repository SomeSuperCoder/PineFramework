import { useEffect, useMemo, useRef, useState } from 'react';
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
import { tokens } from '../theme/tokens';
import { Card, CardContent } from '@/components/ui/card';
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

/** Equity curve canvas — hand-rolled 2D polyline (pennant precedent,
 *  DPR-aware), x = close time, y = cumulative PnL, zero line dashed. */
function EquityCurveChart({ points }: { points: Array<{ time: number; equity: number }> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || points.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    const pad = { top: 16, right: 10, bottom: 8, left: 10 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    const minT = points[0].time;
    const maxT = points[points.length - 1].time;
    const equities = points.map((p) => p.equity);
    const minE = Math.min(0, ...equities);
    const maxE = Math.max(0, ...equities);
    const rangeE = maxE - minE || 1;
    const tRange = maxT - minT || 1;
    const x = (t: number) => pad.left + ((t - minT) / tRange) * plotW;
    const y = (e: number) => pad.top + (1 - (e - minE) / rangeE) * plotH;

    // Zero line
    ctx.strokeStyle = tokens.chart.grid;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, y(0));
    ctx.lineTo(w - pad.right, y(0));
    ctx.stroke();
    ctx.setLineDash([]);

    // Cumulative PnL line
    ctx.strokeStyle = tokens.colors.brand.blue;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(x(p.time), y(p.equity));
      else ctx.lineTo(x(p.time), y(p.equity));
    });
    ctx.stroke();

    ctx.font = '10px monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = tokens.colors.semantic.success;
    ctx.fillText(`max ${fmtSignedUsd(maxE)}`, pad.left + 4, 2);
    ctx.fillStyle = tokens.colors.semantic.error;
    ctx.textBaseline = 'bottom';
    ctx.fillText(`min ${fmtSignedUsd(minE)}`, pad.left + 4, h - 2);
  }, [points]);

  if (points.length === 0) return null;
  return (
    <div
      className="w-full h-[220px] rounded-md border bg-[color:var(--pf-canvas)]"
      style={{ borderColor: tokens.colors.hairline.default }}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}

/** Grouped total-PnL comparison — horizontal bars diverging around a central
 *  zero axis, green/red by sign, group key as label ("Chaos Mode" highlighted). */
function GroupedPnlChart({ groups }: { groups: TradeStatsGroup[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || groups.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const h = groups.length * 28 + 16;
    canvas.width = rect.width * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);
    const w = rect.width;

    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px monospace';
    ctx.textBaseline = 'middle';

    const labelW = Math.min(150, w * 0.28);
    const plotLeft = 10 + labelW;
    const plotRight = w - 10;
    const plotW = plotRight - plotLeft;
    const midX = plotLeft + plotW / 2;
    const halfW = plotW / 2;
    const maxAbs = Math.max(1, ...groups.map((g) => Math.abs(g.stats.totalPnl)));
    const scale = (v: number) => (Math.abs(v) / maxAbs) * halfW;

    // Central zero axis
    ctx.strokeStyle = tokens.chart.grid;
    ctx.beginPath();
    ctx.moveTo(midX, 6);
    ctx.lineTo(midX, h - 6);
    ctx.stroke();

    groups.forEach((g, i) => {
      const y = 10 + i * 28;
      const pnl = g.stats.totalPnl;
      const barW = Math.max(scale(pnl), 2);
      const color = pnl >= 0 ? tokens.colors.semantic.success : tokens.colors.semantic.error;
      const x0 = pnl >= 0 ? midX : midX - barW;

      // Label (group key)
      ctx.fillStyle = g.key === 'Chaos Mode' ? tokens.colors.semantic.warning : tokens.colors.ink['2'];
      const label = g.key.length > 24 ? `${g.key.slice(0, 24)}…` : g.key;
      ctx.fillText(label, 10, y + 7);

      // Bar
      ctx.fillStyle = color;
      ctx.fillRect(x0, y, barW, 14);

      // Value at the bar end
      ctx.fillStyle = color;
      const val = fmtSignedUsd(pnl);
      if (pnl >= 0) {
        ctx.fillText(val, midX + barW + 4, y + 7);
      } else {
        const valW = ctx.measureText(val).width;
        ctx.fillText(val, Math.max(10, x0 - valW - 4), y + 7);
      }
    });
  }, [groups]);

  if (groups.length === 0) return null;
  return (
    <div
      className="w-full max-h-[400px] overflow-auto rounded-md border bg-[color:var(--pf-canvas)]"
      style={{ borderColor: tokens.colors.hairline.default }}
    >
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  title,
}: {
  label: string;
  value: string;
  color?: string;
  title?: string;
}) {
  return (
    <Card
      className="p-2.5 text-center rounded-md border bg-[color:var(--pf-canvas)]"
      title={title}
    >
      <CardContent className="p-0">
        <div
          className="text-[10px] uppercase tracking-[0.5px] mb-1"
          style={{ color: tokens.colors.steel.muted }}
        >
          {label}
        </div>
        <div
          className="text-[15px] font-semibold font-mono"
          style={{ color: color ?? tokens.colors.ink['1'] }}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

const NO_TRADES = (
  <div className="p-8 text-center text-[12px]" style={{ color: tokens.colors.steel.muted }}>
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
    <div className="flex flex-col gap-3.5">
      {/* Controls */}
      <div className="flex gap-2 items-center flex-wrap">
        <ModeToggle value={mode} onChange={setMode} />
        <StatusSelect value={status} onChange={setStatus} />
        <div className="flex-1" />
        <span className="text-[11px]" style={{ color: tokens.colors.steel.muted }}>
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
      <div>
        <div
          className="text-[11px] font-semibold uppercase tracking-[1px] mb-2"
          style={{ color: tokens.colors.steel.muted }}
        >
          Global Metrics
        </div>
        {error && !summary ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : loading && !summary ? (
          <div className="p-6 text-center text-[12px]" style={{ color: tokens.colors.ink['3'] }}>
            Loading statistics…
          </div>
        ) : summary && summary.totalTrades > 0 ? (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            <StatCard label="Total Trades" value={String(summary.totalTrades)} />
            <StatCard label="Win Rate" value={`${(summary.winRate * 100).toFixed(1)}%`} />
            <StatCard
              label="Gross PnL"
              value={fmtSignedUsd(summary.totalPnl)}
              color={summary.totalPnl >= 0 ? tokens.colors.semantic.success : tokens.colors.semantic.error}
              title="Realized PnL before fees (expected-price based — estimate)"
            />
            <StatCard
              label="Net PnL"
              value={fmtSignedUsd(summary.netPnl)}
              color={summary.netPnl >= 0 ? tokens.colors.semantic.success : tokens.colors.semantic.error}
              title="Gross PnL minus fees (fees are 0 in this version — equals gross PnL)"
            />
            <StatCard label="Fees" value={fmtAmount(summary.totalFees)} title="Fees are not included in this version -- always 0 (real fee parsing deferred)" />
            <StatCard
              label="Profit Factor"
              value={
                summary.profitFactor >= Number.MAX_SAFE_INTEGER
                  ? '∞'
                  : summary.profitFactor.toFixed(2)
              }
              color={
                summary.profitFactor >= 1.5
                  ? tokens.colors.semantic.success
                  : summary.profitFactor >= 1
                    ? tokens.colors.semantic.warning
                    : tokens.colors.semantic.error
              }
            />
            <StatCard label="Avg Win" value={fmtSignedUsd(summary.averageWin)} color={tokens.colors.semantic.success} />
            <StatCard label="Avg Loss" value={fmtSignedUsd(summary.averageLoss)} color={tokens.colors.semantic.error} />
            <StatCard label="Best Trade" value={fmtSignedUsd(summary.bestTrade)} color={tokens.colors.semantic.success} />
            <StatCard
              label="Worst Trade"
              value={fmtSignedUsd(summary.worstTrade)}
              color={tokens.colors.semantic.error}
            />
            <StatCard
              label="Avg Trade"
              value={fmtSignedUsd(summary.avgTrade)}
              color={summary.avgTrade >= 0 ? tokens.colors.semantic.success : tokens.colors.semantic.error}
            />
            <StatCard label="Max Drawdown" value={fmtAmount(summary.maxDrawdown)} color={tokens.colors.semantic.error} />
          </div>
        ) : (
          NO_TRADES
        )}
      </div>

      {/* Equity curve */}
      <div>
        <div
          className="text-[11px] font-semibold uppercase tracking-[1px] mb-2"
          style={{ color: tokens.colors.steel.muted }}
        >
          Equity Curve{' '}
          <span className="text-[color:var(--pf-ink-3)] font-normal tracking-normal">
            — cumulative realized PnL over close time (est.)
          </span>
        </div>
        {equityError ? (
          <ErrorState message={equityError} />
        ) : equityLoading && equityTrades.length === 0 ? (
          <div
            className="h-[220px] flex items-center justify-center rounded-md border bg-[color:var(--pf-canvas)]"
            style={{ color: tokens.colors.ink['3'], fontSize: 12, borderColor: tokens.colors.hairline.default }}
          >
            Loading equity curve…
          </div>
        ) : equityPoints.length === 0 ? (
          <div
            className="h-[100px] flex items-center justify-center rounded-md border bg-[color:var(--pf-canvas)]"
            style={{ color: tokens.colors.steel.disabled, fontSize: 12, borderColor: tokens.colors.hairline.default }}
          >
            No trades to chart.
          </div>
        ) : (
          <EquityCurveChart points={equityPoints} />
        )}
      </div>

      {/* Grouped PnL comparison */}
      <div>
        <div
          className="text-[11px] font-semibold uppercase tracking-[1px] mb-2"
          style={{ color: tokens.colors.steel.muted }}
        >
          PnL by {groupLabel}
        </div>
        {error && !groups ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : loading && !groups ? (
          <div className="p-6 text-center text-[12px]" style={{ color: tokens.colors.ink['3'] }}>
            Loading groups…
          </div>
        ) : groups && groups.length > 0 ? (
          <GroupedPnlChart groups={groups} />
        ) : (
          <div className="p-6 text-center text-[12px]" style={{ color: tokens.colors.steel.muted }}>
            No groups to chart.
          </div>
        )}
      </div>
    </div>
  );
}
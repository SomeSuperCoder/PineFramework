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
import { ErrorState, ModeToggle, StatusSelect, filterControlStyle } from './TradeTabShared';

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

/** Equity curve canvas — hand-rolled 2D polyline (BacktestResults precedent,
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
    ctx.strokeStyle = '#333';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, y(0));
    ctx.lineTo(w - pad.right, y(0));
    ctx.stroke();
    ctx.setLineDash([]);

    // Cumulative PnL line
    ctx.strokeStyle = '#2196f3';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(x(p.time), y(p.equity));
      else ctx.lineTo(x(p.time), y(p.equity));
    });
    ctx.stroke();

    ctx.font = '10px monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#4caf50';
    ctx.fillText(`max ${fmtSignedUsd(maxE)}`, pad.left + 4, 2);
    ctx.fillStyle = '#e94560';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`min ${fmtSignedUsd(minE)}`, pad.left + 4, h - 2);
  }, [points]);

  if (points.length === 0) return null;
  return (
    <div
      style={{
        width: '100%',
        height: 220,
        background: '#0d0d18',
        borderRadius: 6,
        border: '1px solid #111128',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
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
    ctx.strokeStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(midX, 6);
    ctx.lineTo(midX, h - 6);
    ctx.stroke();

    groups.forEach((g, i) => {
      const y = 10 + i * 28;
      const pnl = g.stats.totalPnl;
      const barW = Math.max(scale(pnl), 2);
      const color = pnl >= 0 ? '#4caf50' : '#e94560';
      const x0 = pnl >= 0 ? midX : midX - barW;

      // Label (group key)
      ctx.fillStyle = g.key === 'Chaos Mode' ? '#ff9800' : '#aaa';
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
      style={{
        width: '100%',
        maxHeight: 400,
        overflow: 'auto',
        background: '#0d0d18',
        borderRadius: 6,
        border: '1px solid #111128',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', display: 'block' }} />
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
    <div
      style={{
        background: '#0d0d18',
        border: '1px solid #111128',
        padding: '10px 12px',
        borderRadius: 6,
        textAlign: 'center',
      }}
      title={title}
    >
      <div
        style={{
          fontSize: 10,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: color ?? '#e0e0e0',
          fontFamily: 'monospace',
        }}
      >
        {value}
      </div>
    </div>
  );
}

const NO_TRADES = (
  <div style={{ padding: 32, textAlign: 'center', color: '#555', fontSize: 12 }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <ModeToggle value={mode} onChange={setMode} />
        <StatusSelect value={status} onChange={setStatus} />
        <div style={{ flex: 1 }} />
        <span style={{ color: '#888', fontSize: 11 }}>Group by:</span>
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as Exclude<TradeGroupBy, 'global'>)}
          style={filterControlStyle}
          title="Group the PnL comparison chart by strategy, timeframe, or asset"
        >
          <option value="strategy">Strategy</option>
          <option value="timeframe">Timeframe</option>
          <option value="asset">Asset</option>
        </select>
      </div>

      {/* Global metric cards */}
      <div>
        <div
          style={{
            color: '#888',
            fontWeight: 600,
            marginBottom: 8,
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Global Metrics
        </div>
        {error && !summary ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : loading && !summary ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#666', fontSize: 12 }}>
            Loading statistics…
          </div>
        ) : summary && summary.totalTrades > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 8,
            }}
          >
            <StatCard label="Total Trades" value={String(summary.totalTrades)} />
            <StatCard label="Win Rate" value={`${(summary.winRate * 100).toFixed(1)}%`} />
            <StatCard
              label="Gross PnL"
              value={fmtSignedUsd(summary.totalPnl)}
              color={summary.totalPnl >= 0 ? '#4caf50' : '#e94560'}
              title="Realized PnL before fees (expected-price based — estimate)"
            />
            <StatCard
              label="Net PnL"
              value={fmtSignedUsd(summary.netPnl)}
              color={summary.netPnl >= 0 ? '#4caf50' : '#e94560'}
              title="Gross PnL minus fees (fees are 0 in this version — equals gross PnL)"
            />
            <StatCard label="Fees" value={fmtAmount(summary.totalFees)} title="Fees are not included in this version — always 0 (real fee parsing deferred)" />
            <StatCard
              label="Profit Factor"
              value={
                summary.profitFactor >= Number.MAX_SAFE_INTEGER
                  ? '∞'
                  : summary.profitFactor.toFixed(2)
              }
              color={
                summary.profitFactor >= 1.5
                  ? '#4caf50'
                  : summary.profitFactor >= 1
                    ? '#ff9800'
                    : '#e94560'
              }
            />
            <StatCard label="Avg Win" value={fmtSignedUsd(summary.averageWin)} color="#4caf50" />
            <StatCard label="Avg Loss" value={fmtSignedUsd(summary.averageLoss)} color="#e94560" />
            <StatCard label="Best Trade" value={fmtSignedUsd(summary.bestTrade)} color="#4caf50" />
            <StatCard
              label="Worst Trade"
              value={fmtSignedUsd(summary.worstTrade)}
              color="#e94560"
            />
            <StatCard
              label="Avg Trade"
              value={fmtSignedUsd(summary.avgTrade)}
              color={summary.avgTrade >= 0 ? '#4caf50' : '#e94560'}
            />
            <StatCard label="Max Drawdown" value={fmtAmount(summary.maxDrawdown)} color="#e94560" />
          </div>
        ) : (
          NO_TRADES
        )}
      </div>

      {/* Equity curve */}
      <div>
        <div
          style={{
            color: '#888',
            fontWeight: 600,
            marginBottom: 8,
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Equity Curve{' '}
          <span style={{ color: '#666', fontWeight: 400, letterSpacing: 0 }}>
            — cumulative realized PnL over close time (est.)
          </span>
        </div>
        {equityError ? (
          <ErrorState message={equityError} />
        ) : equityLoading && equityTrades.length === 0 ? (
          <div
            style={{
              height: 220,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#666',
              fontSize: 12,
              background: '#0d0d18',
              borderRadius: 6,
              border: '1px solid #111128',
            }}
          >
            Loading equity curve…
          </div>
        ) : equityPoints.length === 0 ? (
          <div
            style={{
              height: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#555',
              fontSize: 12,
              background: '#0d0d18',
              borderRadius: 6,
              border: '1px solid #111128',
            }}
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
          style={{
            color: '#888',
            fontWeight: 600,
            marginBottom: 8,
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          PnL by {groupLabel}
        </div>
        {error && !groups ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : loading && !groups ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#666', fontSize: 12 }}>
            Loading groups…
          </div>
        ) : groups && groups.length > 0 ? (
          <GroupedPnlChart groups={groups} />
        ) : (
          <div style={{ padding: 24, textAlign: 'center', color: '#555', fontSize: 12 }}>
            No groups to chart.
          </div>
        )}
      </div>
    </div>
  );
}

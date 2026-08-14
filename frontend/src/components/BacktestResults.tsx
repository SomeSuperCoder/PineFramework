import { useEffect, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import type { BacktestResultResponse, EquityPoint } from '../types';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EffectiveConfigSummary } from './EffectiveConfigSummary';
import { StatGrid } from './StatGrid';
import { TradeTable } from './TradeTable';
import { WarningsStrip } from './WarningsStrip';

interface BacktestResultsProps {
  result: BacktestResultResponse;
  onClose?: () => void;
  onSelectTrade?: (tradeIndex: number) => void;
  jobId?: string | null;
}

/** Equity & drawdown — Recharts LineChart replacing the hand-rolled canvas. */
function EquityDrawdownChart({ points }: { points: EquityPoint[] }) {
  if (points.length < 2) return null;

  const data = points.map((p) => ({
    time: new Date(p.time).toLocaleDateString(),
    equity: p.equity,
    drawdown: p.drawdown,
  }));

  return (
    <ChartContainer
      config={{
        equity: { label: 'Equity', color: 'var(--color-primary)' },
        drawdown: { label: 'Drawdown', color: 'var(--color-destructive)' },
      }}
      className="h-full w-full"
    >
      <LineChart data={data} margin={{ top: 16, right: 10, bottom: 8, left: 10 }}>
        <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border)" yAxisId="equity" />
        <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        {/* Two Y axes so BOTH series are visible: equity zooms to its own range (the real
            payload wiggles only ±2.28%, which a [0, ~10200] axis renders as a flat line),
            and drawdown (0–175, ~1.7% of the equity scale) gets its own right axis instead
            of hugging 0. domain string form 'dataMin - 10' is Recharts v3-supported. */}
        <YAxis
          yAxisId="equity"
          domain={['dataMin - 10', 'dataMax + 10']}
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `$${v}`}
        />
        <YAxis
          yAxisId="dd"
          orientation="right"
          domain={[0, 'dataMax + 10']}
          tick={{ fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `$${v}`}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          type="monotone"
          dataKey="equity"
          yAxisId="equity"
          stroke="var(--color-primary)"
          strokeWidth={1.5}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="drawdown"
          yAxisId="dd"
          stroke="var(--color-destructive)"
          strokeWidth={1}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

export function BacktestResults({ result, onClose, onSelectTrade, jobId }: BacktestResultsProps) {
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'success' | 'error'>('idle');
  const [exportError, setExportError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const exportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (exportTimeoutRef.current) {
        clearTimeout(exportTimeoutRef.current);
        exportTimeoutRef.current = null;
      }
    };
  }, []);

  const { metrics } = result;

  const exportCSV = () => {
    let csv = 'Trade ID,Direction,Entry Price,Exit Price,Entry Time,Exit Time,Quantity,PnL,PnL%,MAE,MFE,Bars Held\n';
    for (const t of result.trades) {
      csv += `${t.id},${t.direction},${t.entryPrice},${t.exitPrice},${new Date(t.entryTime).toISOString()},${new Date(t.exitTime).toISOString()},${t.quantity},${t.pnl},${t.pnlPercent},${t.mae},${t.mfe},${t.barsHeld}\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backtest-trades.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Triggers the server-side full-data export. The response body is
   * informational only — the file is written server-side. State machine:
   * idle → exporting → success (2s) | error. The mounted guard ignores
   * stale responses after unmount; the timeout ref is cleared on unmount.
   */
  const exportFullData = async () => {
    if (!jobId || exportState === 'exporting') return;
    setExportError(null);
    setExportState('exporting');
    try {
      const response = await fetch('/api/backtest/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId }),
      });
      if (!mountedRef.current) return;
      if (response.ok) {
        setExportState('success');
        if (exportTimeoutRef.current) clearTimeout(exportTimeoutRef.current);
        exportTimeoutRef.current = setTimeout(() => {
          exportTimeoutRef.current = null;
          if (mountedRef.current) setExportState('idle');
        }, 2000);
      } else {
        let message = `Export failed (HTTP ${response.status})`;
        try {
          const body: unknown = await response.json();
          const errorMsg =
            typeof body === 'object' &&
            body !== null &&
            'error' in body &&
            typeof (body as Record<string, unknown>).error === 'string'
              ? (body as { error: string }).error
              : null;
          if (errorMsg) message = `Export failed — ${errorMsg}`;
        } catch {
          // Non-JSON error body — keep the HTTP status message.
        }
        setExportState('error');
        setExportError(message);
      }
    } catch {
      if (mountedRef.current) {
        setExportState('error');
        setExportError('Export failed — network error');
      }
    }
  };

  return (
    <div className="backtest-results flex w-full flex-col gap-4 text-[13px] text-foreground">
      {/* Header: title + Export dropdown + Close */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-primary">Backtest Results</CardTitle>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={exportCSV}>Export CSV</DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={exportFullData}
                  disabled={!jobId || exportState === 'exporting'}
                >
                  {exportState === 'exporting'
                    ? 'Exporting…'
                    : exportState === 'success'
                      ? 'Exported ✓'
                      : 'Export Full Data'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {exportState === 'error' && exportError && (
              <span className="text-xs text-destructive" role="alert">
                {exportError}
              </span>
            )}
            {onClose && (
              <Button type="button" variant="destructive" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </CardHeader>

        {/* What actually ran + diagnostics — inserted between header and stat grid */}
        <EffectiveConfigSummary config={result.effectiveConfig} />
        <WarningsStrip warnings={result.warnings} />

        {/* Stat grid */}
        <StatGrid metrics={metrics} />
      </Card>

      {/* Equity & drawdown chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#eab308]">
            Equity &amp; Drawdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] w-full rounded-md bg-background">
            <EquityDrawdownChart points={result.equityPoints} />
          </div>
        </CardContent>
      </Card>

      {/* Trade list */}
      <TradeTable trades={result.trades} onSelectTrade={onSelectTrade} />
    </div>
  );
}

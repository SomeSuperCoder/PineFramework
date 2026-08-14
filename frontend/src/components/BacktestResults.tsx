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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface BacktestResultsProps {
  result: BacktestResultResponse;
  onClose?: () => void;
  onSelectTrade?: (tradeIndex: number) => void;
  jobId?: string | null;
}

/** Small stat tile (§15.2 Card recipe: label caption + tabular-nums value). */
function StatCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <Card size="sm" className="gap-1 text-center">
      <CardHeader className="items-center gap-0 pb-0">
        <CardTitle className="text-[11px] font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="pt-1">
        <div className={`text-base font-semibold tabular-nums ${valueClassName ?? ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
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
  const [sortField, setSortField] = useState<string>('pnl');
  const [sortAsc, setSortAsc] = useState(false);
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

  const { metrics, trades } = result;

  const sortedTrades = [...trades].sort((a, b) => {
    const aVal = (a as any)[sortField] ?? 0;
    const bVal = (b as any)[sortField] ?? 0;
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  const exportCSV = () => {
    let csv = 'Trade ID,Direction,Entry Price,Exit Price,Entry Time,Exit Time,Quantity,PnL,PnL%,MAE,MFE,Bars Held\n';
    for (const t of trades) {
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

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sortIndicator = (field: string) => {
    if (sortField !== field) return '';
    return sortAsc ? ' ▲' : ' ▼';
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

        {/* Stat grid */}
        <CardContent>
          <div className="grid grid-cols-4 gap-2">
            <StatCard
              label="Net Profit"
              value={`$${metrics.totalPnl.toFixed(2)}`}
              valueClassName={
                metrics.totalPnl >= 0
                  ? 'text-[#22c55e]'
                  : 'text-destructive'
              }
            />
            <StatCard label="Win Rate" value={`${metrics.winRate.toFixed(1)}%`} />
            <StatCard label="Profit Factor" value={`${metrics.profitFactor.toFixed(2)}`} />
            <StatCard label="Sharpe" value={`${metrics.sharpeRatio.toFixed(2)}`} />
            <StatCard
              label="Max DD"
              value={`${metrics.maxDrawdownPercent.toFixed(1)}%`}
              valueClassName="text-destructive"
            />
            <StatCard label="Sortino" value={`${metrics.sortinoRatio.toFixed(2)}`} />
            <StatCard label="Total Trades" value={`${metrics.totalTrades}`} />
            <StatCard label="Commission" value={`$${metrics.commission.toFixed(2)}`} />
          </div>
        </CardContent>
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
      <Card>
        <CardHeader>
          <CardTitle className="text-[#eab308]">
            Trade List ({sortedTrades.length} trades)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedTrades.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">No trades</div>
          ) : (
            <Table className="font-mono text-[11px]">
              <TableHeader>
                <TableRow className="bg-border">
                  <TableHead
                    className="cursor-pointer px-2 py-1.5 whitespace-nowrap"
                    onClick={() => toggleSort('direction')}
                    style={{
                      color: sortField === 'direction' ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
                    }}
                  >
                    Dir{sortIndicator('direction')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer px-2 py-1.5 whitespace-nowrap"
                    onClick={() => toggleSort('entryPrice')}
                    style={{
                      color: sortField === 'entryPrice' ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
                    }}
                  >
                    Entry{sortIndicator('entryPrice')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer px-2 py-1.5 whitespace-nowrap"
                    onClick={() => toggleSort('exitPrice')}
                    style={{
                      color: sortField === 'exitPrice' ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
                    }}
                  >
                    Exit{sortIndicator('exitPrice')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer px-2 py-1.5 whitespace-nowrap"
                    onClick={() => toggleSort('pnl')}
                    style={{
                      color: sortField === 'pnl' ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
                    }}
                  >
                    PnL{sortIndicator('pnl')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer px-2 py-1.5 whitespace-nowrap"
                    onClick={() => toggleSort('pnlPercent')}
                    style={{
                      color: sortField === 'pnlPercent' ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
                    }}
                  >
                    Return{sortIndicator('pnlPercent')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer px-2 py-1.5 whitespace-nowrap"
                    onClick={() => toggleSort('mae')}
                    style={{
                      color: sortField === 'mae' ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
                    }}
                  >
                    MAE{sortIndicator('mae')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer px-2 py-1.5 whitespace-nowrap"
                    onClick={() => toggleSort('mfe')}
                    style={{
                      color: sortField === 'mfe' ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
                    }}
                  >
                    MFE{sortIndicator('mfe')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer px-2 py-1.5 whitespace-nowrap"
                    onClick={() => toggleSort('barsHeld')}
                    style={{
                      color: sortField === 'barsHeld' ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
                    }}
                  >
                    Bars{sortIndicator('barsHeld')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTrades.map((t, i) => (
                  <TableRow
                    key={t.id}
                    onClick={() => onSelectTrade?.(i)}
                    className="border-b border-border"
                    style={{
                      cursor: onSelectTrade ? 'pointer' : 'default',
                      background:
                        i % 2 === 0 ? 'var(--color-background)' : 'var(--color-card)',
                    }}
                  >
                    <TableCell
                      className="px-2 py-1"
                      style={{
                        color:
                          t.direction === 'long'
                            ? '#22c55e'
                            : 'var(--color-destructive)',
                      }}
                    >
                      {t.direction === 'long' ? 'L' : 'S'}
                    </TableCell>
                    <TableCell className="px-2 py-1">${t.entryPrice.toFixed(2)}</TableCell>
                    <TableCell className="px-2 py-1">${t.exitPrice.toFixed(2)}</TableCell>
                    <TableCell
                      className="px-2 py-1"
                      style={{
                        color: t.pnl >= 0 ? '#22c55e' : 'var(--color-destructive)',
                      }}
                    >
                      ${t.pnl.toFixed(2)}
                    </TableCell>
                    <TableCell
                      className="px-2 py-1"
                      style={{
                        color:
                          t.pnlPercent >= 0 ? '#22c55e' : 'var(--color-destructive)',
                      }}
                    >
                      {t.pnlPercent.toFixed(2)}%
                    </TableCell>
                    <TableCell className="px-2 py-1">{t.mae.toFixed(2)}%</TableCell>
                    <TableCell className="px-2 py-1">{t.mfe.toFixed(2)}%</TableCell>
                    <TableCell className="px-2 py-1">{t.barsHeld}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { BacktestResultResponse } from '../types';
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

export function BacktestResults({ result, onClose, onSelectTrade }: BacktestResultsProps) {
  const equityCanvasRef = useRef<HTMLCanvasElement>(null);
  const [sortField, setSortField] = useState<string>('pnl');
  const [sortAsc, setSortAsc] = useState(false);

  const { metrics, trades } = result;

  const sortedTrades = [...trades].sort((a, b) => {
    const aVal = (a as any)[sortField] ?? 0;
    const bVal = (b as any)[sortField] ?? 0;
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  useEffect(() => {
    if (!equityCanvasRef.current || !result.equityPoints || result.equityPoints.length < 2) return;

    const canvas = equityCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

    const points = result.equityPoints;
    const equities = points.map((p) => p.equity);
    const drawdowns = points.map((p) => p.drawdown);
    const minEquity = Math.min(...equities);
    const maxEquity = Math.max(...equities);
    const maxDD = Math.max(...drawdowns);
    const equityRange = maxEquity - minEquity || 1;

    const pad = 10;
    const plotW = w - pad * 2;
    const plotH = h / 2 - pad * 2;
    const ddH = h / 2 - pad * 2;

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'var(--color-primary)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const x = pad + (i / (points.length - 1)) * plotW;
      const y = pad + (1 - (equities[i] - minEquity) / equityRange) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#22c55e';
    ctx.font = '11px monospace';
    ctx.fillText(`Equity: $${maxEquity.toFixed(0)}`, pad, pad + 12);

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const x = pad + (i / (points.length - 1)) * plotW;
      const y = pad + plotH + pad + (1 - drawdowns[i] / (maxDD || 1)) * ddH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#eab308';
    ctx.fillText(`Max DD: $${maxDD.toFixed(0)}`, pad, pad + plotH + pad + 12);
  }, [result]);

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
              </DropdownMenuContent>
            </DropdownMenu>
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

      {/* Equity & drawdown canvas host */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#eab308]">
            Equity &amp; Drawdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] w-full rounded-md bg-background">
            <canvas ref={equityCanvasRef} className="h-full w-full" />
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

import { useState } from 'react';
import type { BacktestTrade } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** The 8 clickable sort columns — exactly the set the panel exposes. */
type TradeSortField =
  | 'direction'
  | 'entryPrice'
  | 'exitPrice'
  | 'pnl'
  | 'pnlPercent'
  | 'mae'
  | 'mfe'
  | 'barsHeld';

const COLUMNS: Array<{ key: TradeSortField; label: string }> = [
  { key: 'direction', label: 'Dir' },
  { key: 'entryPrice', label: 'Entry' },
  { key: 'exitPrice', label: 'Exit' },
  { key: 'pnl', label: 'PnL' },
  { key: 'pnlPercent', label: 'Return' },
  { key: 'mae', label: 'MAE' },
  { key: 'mfe', label: 'MFE' },
  { key: 'barsHeld', label: 'Bars' },
];

/**
 * Numeric sort key for a column. String columns (direction) were previously
 * coerced through subtraction producing NaN (treated as "equal"); mapping to
 * 0 keeps that stable order while satisfying strict typing — no `any`.
 */
function sortValue(trade: BacktestTrade, field: TradeSortField): number {
  const v = trade[field];
  return typeof v === 'number' ? v : Number(v) || 0;
}

interface TradeTableProps {
  trades: BacktestTrade[];
  onSelectTrade?: (tradeIndex: number) => void;
}

/** Sortable trade list — extracted from BacktestResults to keep that file lean. */
export function TradeTable({ trades, onSelectTrade }: TradeTableProps) {
  const [sortField, setSortField] = useState<TradeSortField>('pnl');
  const [sortAsc, setSortAsc] = useState(false);

  const sortedTrades = [...trades].sort((a, b) => {
    const aVal = sortValue(a, sortField);
    const bVal = sortValue(b, sortField);
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  const toggleSort = (field: TradeSortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sortIndicator = (field: TradeSortField) => {
    if (sortField !== field) return '';
    return sortAsc ? ' ▲' : ' ▼';
  };

  return (
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
                {COLUMNS.map((col) => (
                  <TableHead
                    key={col.key}
                    className="cursor-pointer px-2 py-1.5 whitespace-nowrap"
                    onClick={() => toggleSort(col.key)}
                    style={{
                      color:
                        sortField === col.key
                          ? 'var(--color-primary)'
                          : 'var(--color-muted-foreground)',
                    }}
                  >
                    {col.label}
                    {sortIndicator(col.key)}
                  </TableHead>
                ))}
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
  );
}

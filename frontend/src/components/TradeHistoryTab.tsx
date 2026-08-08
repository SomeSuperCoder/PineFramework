import { useEffect, useMemo, useState } from 'react';
import type { TradeHistoryMode, TradeHistoryStatus, TradeRecord } from '../types/trade';
import { useTradeHistory } from '../hooks/useTradeHistory';
import { DASH, fmtPnl, fmtSize, fmtTimeframe, fmtTimestamp } from '../utils/format';
import { ErrorState, ModeToggle, StatusSelect } from './TradeTabShared';
import { tokens } from '../theme/tokens';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface TradeHistoryTabProps {
  backendUrl: string;
  liveTrades: TradeRecord[];
  reconnectEpoch: number;
}

type SortField =
  | 'side'
  | 'symbol'
  | 'timeframe'
  | 'strategy'
  | 'entryPrice'
  | 'exitPrice'
  | 'size'
  | 'realizedPnl'
  | 'fees'
  | 'status'
  | 'openedAt'
  | 'closedAt';

const COLUMNS: Array<{ field: SortField; label: string; numeric?: boolean }> = [
  { field: 'side', label: 'Direction' },
  { field: 'symbol', label: 'Symbol' },
  { field: 'timeframe', label: 'Timeframe' },
  { field: 'strategy', label: 'Strategy' },
  { field: 'entryPrice', label: 'Entry', numeric: true },
  { field: 'exitPrice', label: 'Exit', numeric: true },
  { field: 'size', label: 'Size', numeric: true },
  { field: 'realizedPnl', label: 'PnL', numeric: true },
  { field: 'fees', label: 'Fees', numeric: true },
  { field: 'status', label: 'Status' },
  { field: 'openedAt', label: 'Opened' },
  { field: 'closedAt', label: 'Closed' },
];

const TIMEFRAME_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '1', label: '1m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '30', label: '30m' },
  { value: '60', label: '1h' },
  { value: '240', label: '4h' },
  { value: '1440', label: '1d' },
];

/**
 * Trade History tab (design D6 / task 4.2): sortable, filterable
 * (mode/status/strategy/timeframe/asset), cursor-paginated table of persisted
 * trades. Data comes from useTradeHistory — REST page fetch + live bot:trade
 * merge + reconnect refetch, all in the hook (test seam: no live backend).
 */
export function TradeHistoryTab({ backendUrl, liveTrades, reconnectEpoch }: TradeHistoryTabProps) {
  // Filters. Text inputs are debounced (300ms) so typing does not refetch per
  // keystroke; selects/toggles apply immediately.
  const [mode, setMode] = useState<TradeHistoryMode>('all');
  const [status, setStatus] = useState<TradeHistoryStatus>('confirmed');
  const [symbolInput, setSymbolInput] = useState('');
  const [symbol, setSymbol] = useState('');
  const [timeframe, setTimeframe] = useState('');
  const [strategyInput, setStrategyInput] = useState('');
  const [strategy, setStrategy] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setSymbol(symbolInput.trim()), 300);
    return () => clearTimeout(t);
  }, [symbolInput]);

  useEffect(() => {
    const t = setTimeout(() => setStrategy(strategyInput.trim()), 300);
    return () => clearTimeout(t);
  }, [strategyInput]);

  const filter = useMemo(
    () => ({ mode, status, symbol, timeframe, strategy }),
    [mode, status, symbol, timeframe, strategy],
  );

  const history = useTradeHistory({
    backendUrl,
    filter,
    enabled: true,
    reconnectEpoch,
    liveTrades,
  });

  const [sortField, setSortField] = useState<SortField>('closedAt');
  const [sortAsc, setSortAsc] = useState(false);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortAsc((a) => !a);
    else {
      setSortField(field);
      setSortAsc(false);
    }
  };
  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return '';
    return sortAsc ? ' ▲' : ' ▼';
  };

  const sortedTrades = useMemo(() => {
    const arr = [...history.trades];
    arr.sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      let cmp: number;
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv;
      } else {
        cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      }
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [history.trades, sortField, sortAsc]);

  const strategyOptions = useMemo(() => {
    const s = new Set<string>();
    for (const t of history.trades) {
      if (t.strategy) s.add(t.strategy);
    }
    return [...s].sort();
  }, [history.trades]);

  const filterActive =
    filter.mode !== 'all' ||
    filter.status !== 'confirmed' ||
    !!filter.symbol ||
    !!filter.timeframe ||
    !!filter.strategy;

  const { trades, loading, loadingMore, error, hasMore } = history;

  const filterInputClass =
    'h-9 border border-[color:var(--pf-hairline-strong)] bg-[color:var(--pf-canvas)] px-2 text-[11px] text-[color:var(--pf-ink-1)] box-border';

  return (
    <div className="flex flex-col gap-2.5">
      {/* Section label + loaded count */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <span
          className="text-[11px] font-semibold uppercase tracking-[1px]"
          style={{ color: tokens.colors.steel.muted }}
        >
          Trade History
        </span>
        {!loading && !error && (
          <span className="text-[11px]" style={{ color: tokens.colors.steel.disabled }}>
            {history.totalLoaded} loaded{hasMore ? ' · more available' : ''}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center flex-wrap">
        <ModeToggle value={mode} onChange={setMode} />
        <StatusSelect value={status} onChange={setStatus} />
        <input
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value)}
          placeholder="Symbol (e.g. BTCUSDT)"
          className={`${filterInputClass} w-[150px]`}
        />
        <select
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value)}
          className={filterInputClass}
          title="Timeframe filter"
        >
          <option value="">All timeframes</option>
          {TIMEFRAME_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          list="trade-history-strategy-options"
          value={strategyInput}
          onChange={(e) => setStrategyInput(e.target.value)}
          placeholder="Strategy"
          className={`${filterInputClass} w-[170px]`}
        />
        <datalist id="trade-history-strategy-options">
          {strategyOptions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>

      {/* Body: error / loading / empty / table */}
      {error ? (
        <ErrorState message={error} onRetry={history.reload} />
      ) : loading && trades.length === 0 ? (
        <div className="p-6 text-center text-[12px]" style={{ color: tokens.colors.ink['3'] }}>
          Loading trade history…
        </div>
      ) : trades.length === 0 ? (
        <div className="p-8 text-center text-[12px]" style={{ color: tokens.colors.steel.muted }}>
          No trades yet{filterActive ? ' matching these filters' : ''}.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className="w-full text-[11px] font-mono">
            <TableHeader>
              <TableRow className="bg-[color:var(--pf-hairline)]">
                {COLUMNS.map((col) => (
                  <TableHead
                    key={col.field}
                    aria-sort={
                      sortField === col.field
                        ? sortAsc
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                    className={`px-2 py-1.5 whitespace-nowrap ${
                      col.numeric ? 'text-right' : 'text-left'
                    }`}
                    style={{
                      color:
                        sortField === col.field
                          ? tokens.colors.brand.blue
                          : tokens.colors.ink['2'],
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.field)}
                      className={`inline-flex cursor-pointer items-center gap-0.5 border-0 bg-transparent p-0 text-inherit ${
                        col.numeric ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {col.label}
                      {sortIndicator(col.field)}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTrades.map((t, i) => (
                <TableRow
                  key={t.id}
                  className="border-b border-[var(--pf-hairline)]"
                  style={{
                    background: i % 2 === 0 ? tokens.colors.canvas : tokens.colors.surface['1'],
                  }}
                >
                  <TableCell
                    className="px-2 py-1 font-semibold"
                    style={{
                      color:
                        t.side === 'buy'
                          ? tokens.colors.semantic.success
                          : tokens.colors.semantic.error,
                    }}
                  >
                    {t.side === 'buy' ? 'BUY' : 'SELL'}
                  </TableCell>
                  <TableCell className="px-2 py-1 font-semibold">{t.symbol}</TableCell>
                  <TableCell className="px-2 py-1" style={{ color: tokens.colors.steel.muted }}>
                    {fmtTimeframe(t.timeframe)}
                  </TableCell>
                  <TableCell
                    className="px-2 py-1 max-w-[180px] truncate whitespace-nowrap"
                    style={{
                      color: t.strategy === 'Chaos Mode' ? tokens.colors.semantic.warning : tokens.colors.ink['2'],
                    }}
                    title={t.strategy}
                  >
                    {t.strategy ?? DASH}
                  </TableCell>
                  <TableCell className="px-2 py-1 text-right" style={{ color: tokens.colors.ink['2'] }}>
                    ${t.entryPrice.toFixed(2)}
                  </TableCell>
                  <TableCell className="px-2 py-1 text-right" style={{ color: tokens.colors.ink['2'] }}>
                    ${t.exitPrice.toFixed(2)}
                  </TableCell>
                  <TableCell className="px-2 py-1 text-right" style={{ color: tokens.colors.ink['2'] }}>
                    {fmtSize(t.size)}
                  </TableCell>
                  <TableCell
                    className="px-2 py-1 text-right font-semibold"
                    style={{ color: fmtPnl(t.realizedPnl).color }}
                  >
                    {fmtPnl(t.realizedPnl).text}
                  </TableCell>
                  <TableCell className="px-2 py-1 text-right" style={{ color: tokens.colors.ink['2'] }}>
                    ${t.fees.toFixed(2)}
                  </TableCell>
                  <TableCell
                    className="px-2 py-1"
                    style={{
                      color:
                        t.status === 'unknown'
                          ? tokens.colors.semantic.warning
                          : t.status === 'confirmed'
                            ? tokens.colors.semantic.success
                            : tokens.colors.steel.muted,
                    }}
                  >
                    {t.status ?? DASH}
                  </TableCell>
                  <TableCell className="px-2 py-1" style={{ color: tokens.colors.ink['3'] }}>
                    {fmtTimestamp(t.openedAt)}
                  </TableCell>
                  <TableCell className="px-2 py-1" style={{ color: tokens.colors.ink['3'] }}>
                    {fmtTimestamp(t.closedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination — Next loads older pages, Previous re-loads the prior page */}
      {!loading && !error && trades.length > 0 && (
        <div className="flex items-center gap-2.5 justify-end">
          <span className="text-[11px]" style={{ color: tokens.colors.steel.disabled }}>
            Page {history.page + 1}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={history.goBack}
            disabled={!history.canGoBack || loadingMore}
            className="h-8 px-2.5 text-[11px]"
          >
            ← Prev
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={history.goNext}
            disabled={!hasMore || loadingMore}
            className="h-8 px-2.5 text-[11px]"
          >
            {loadingMore ? 'Loading…' : 'Next →'}
          </Button>
        </div>
      )}
    </div>
  );
}
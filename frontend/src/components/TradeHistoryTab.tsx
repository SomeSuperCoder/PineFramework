import { useEffect, useMemo, useState } from 'react';
import type { TradeHistoryMode, TradeHistoryStatus, TradeRecord } from '../types/trade';
import { useTradeHistory } from '../hooks/useTradeHistory';
import { DASH, fmtPnl, fmtSize, fmtTimeframe, fmtTimestamp } from '../utils/format';
import {
  ErrorState,
  ModeToggle,
  StatusSelect,
  filterControlStyle,
  pageButtonStyle,
} from './TradeTabShared';
import { tokens } from '../theme/tokens';

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Section label + loaded count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span
          style={{
            color: tokens.colors.steel.muted,
            fontWeight: 600,
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Trade History
        </span>
        {!loading && !error && (
          <span style={{ color: tokens.colors.steel.disabled, fontSize: 11 }}>
            {history.totalLoaded} loaded{hasMore ? ' · more available' : ''}
          </span>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <ModeToggle value={mode} onChange={setMode} />
        <StatusSelect value={status} onChange={setStatus} />
        <input
          value={symbolInput}
          onChange={(e) => setSymbolInput(e.target.value)}
          placeholder="Symbol (e.g. BTCUSDT)"
          style={{ ...filterControlStyle, width: 150 }}
        />
        <select
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value)}
          style={filterControlStyle}
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
          style={{ ...filterControlStyle, width: 170 }}
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
        <div style={{ padding: 24, textAlign: 'center', color: '#666', fontSize: 12 }}>
          Loading trade history…
        </div>
      ) : trades.length === 0 ? (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: tokens.colors.steel.disabled,
            fontSize: 12,
          }}
        >
          No trades yet{filterActive ? ' matching these filters' : ''}.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 11,
              fontFamily: 'monospace',
            }}
          >
            <thead>
              <tr style={{ background: tokens.colors.hairline.default }}>
                {COLUMNS.map((col) => (
                  <th
                    key={col.field}
                    onClick={() => toggleSort(col.field)}
                    style={{
                      padding: '5px 8px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      textAlign: col.numeric ? 'right' : 'left',
                      color: sortField === col.field ? '#64b5f6' : '#aaa',
                    }}
                  >
                    {col.label}
                    {sortIndicator(col.field)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedTrades.map((t, i) => (
                <tr
                  key={t.id}
                  style={{
                    borderBottom: `1px solid ${tokens.colors.hairline.default}`,
                    background: i % 2 === 0 ? tokens.colors.canvas : tokens.colors.surface['1'],
                  }}
                >
                  <td
                    style={{
                      padding: '4px 8px',
                      color:
                        t.side === 'buy'
                          ? tokens.colors.semantic.success
                          : tokens.colors.semantic.error,
                      fontWeight: 600,
                    }}
                  >
                    {t.side === 'buy' ? 'BUY' : 'SELL'}
                  </td>
                  <td
                    style={{ padding: '4px 8px', color: tokens.colors.ink['1'], fontWeight: 600 }}
                  >
                    {t.symbol}
                  </td>
                  <td style={{ padding: '4px 8px', color: tokens.colors.steel.muted }}>
                    {fmtTimeframe(t.timeframe)}
                  </td>
                  <td
                    style={{
                      padding: '4px 8px',
                      color: t.strategy === 'Chaos Mode' ? tokens.colors.semantic.warning : '#aaa',
                      maxWidth: 180,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={t.strategy}
                  >
                    {t.strategy ?? DASH}
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: '#d0d0d0' }}>
                    ${t.entryPrice.toFixed(2)}
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: '#d0d0d0' }}>
                    ${t.exitPrice.toFixed(2)}
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: '#d0d0d0' }}>
                    {fmtSize(t.size)}
                  </td>
                  <td
                    style={{
                      padding: '4px 8px',
                      textAlign: 'right',
                      color: fmtPnl(t.realizedPnl).color,
                      fontWeight: 600,
                    }}
                  >
                    {fmtPnl(t.realizedPnl).text}
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', color: '#aaa' }}>
                    ${t.fees.toFixed(2)}
                  </td>
                  <td
                    style={{
                      padding: '4px 8px',
                      color:
                        t.status === 'unknown'
                          ? tokens.colors.semantic.warning
                          : t.status === 'confirmed'
                            ? tokens.colors.semantic.success
                            : tokens.colors.steel.muted,
                    }}
                  >
                    {t.status ?? DASH}
                  </td>
                  <td style={{ padding: '4px 8px', color: '#777' }}>{fmtTimestamp(t.openedAt)}</td>
                  <td style={{ padding: '4px 8px', color: '#777' }}>{fmtTimestamp(t.closedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination — Next loads older pages, Previous re-loads the prior page */}
      {!loading && !error && trades.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
          <span style={{ color: tokens.colors.steel.disabled, fontSize: 11 }}>
            Page {history.page + 1}
          </span>
          <button
            type="button"
            onClick={history.goBack}
            disabled={!history.canGoBack || loadingMore}
            style={{
              ...pageButtonStyle,
              opacity: !history.canGoBack || loadingMore ? 0.5 : 1,
              cursor: !history.canGoBack || loadingMore ? 'default' : 'pointer',
            }}
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={history.goNext}
            disabled={!hasMore || loadingMore}
            style={{
              ...pageButtonStyle,
              opacity: !hasMore || loadingMore ? 0.5 : 1,
              cursor: !hasMore || loadingMore ? 'default' : 'pointer',
            }}
          >
            {loadingMore ? 'Loading…' : 'Next →'}
          </button>
        </div>
      )}
    </div>
  );
}

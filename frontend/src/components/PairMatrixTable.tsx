import { useState, useCallback } from 'react';

// Known trading symbols from backend DEFAULT_SYMBOLS
const SYMBOLS = ['SOLUSDT', 'BTCUSDT', 'ETHUSDT', 'BONKUSDT', 'ORCAUSDT', 'JUPUSDT', 'PYTHUSDT', 'RAYUSDT', 'WIFUSDT'];

// Valid timeframes with human labels
const TIMEFRAMES: Array<{ value: string; label: string }> = [
  { value: '1', label: '1m' },
  { value: '3', label: '3m' },
  { value: '5', label: '5m' },
  { value: '15', label: '15m' },
  { value: '30', label: '30m' },
  { value: '60', label: '1h' },
  { value: '120', label: '2h' },
  { value: '240', label: '4h' },
  { value: 'D', label: '1d' },
  { value: 'W', label: '1w' },
  { value: 'M', label: '1M' },
];

interface PairRow {
  id: number;
  symbol: string;
  timeframe: string;
}

interface PairMatrixTableProps {
  value: Array<{ symbol: string; timeframe: string }>;
  onChange: (pairs: Array<{ symbol: string; timeframe: string }>) => void;
}

export function PairMatrixTable({ value, onChange }: PairMatrixTableProps) {
  const [rows, setRows] = useState<PairRow[]>(() => {
    if (value.length > 0) {
      return value.map((p, i) => ({ id: i, symbol: p.symbol, timeframe: p.timeframe }));
    }
    return [
      { id: 0, symbol: 'SOLUSDT', timeframe: '60' },
      { id: 1, symbol: 'BTCUSDT', timeframe: '240' },
      { id: 2, symbol: 'ETHUSDT', timeframe: '60' },
    ];
  });
  const [nextId, setNextId] = useState(3);

  // Sync to parent
  const syncToParent = useCallback((r: PairRow[]) => {
    onChange(r.map(({ symbol, timeframe }) => ({ symbol, timeframe })));
  }, [onChange]);

  const handleAddRow = useCallback(() => {
    setRows((prev) => {
      const newRow = { id: nextId, symbol: 'SOLUSDT', timeframe: '60' };
      const next = [...prev, newRow];
      syncToParent(next);
      return next;
    });
    setNextId((n) => n + 1);
  }, [nextId, syncToParent]);

  const handleRemoveRow = useCallback((id: number) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      syncToParent(next);
      return next;
    });
  }, [syncToParent]);

  const handleSymbolChange = useCallback((id: number, symbol: string) => {
    setRows((prev) => {
      const next = prev.map((r) => r.id === id ? { ...r, symbol } : r);
      syncToParent(next);
      return next;
    });
  }, [syncToParent]);

  const handleTimeframeChange = useCallback((id: number, timeframe: string) => {
    setRows((prev) => {
      const next = prev.map((r) => r.id === id ? { ...r, timeframe } : r);
      syncToParent(next);
      return next;
    });
  }, [syncToParent]);

  // Detect duplicates
  const duplicatePairs = new Set<string>();
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.symbol}:${row.timeframe}`;
    if (seen.has(key)) {
      duplicatePairs.add(key);
    }
    seen.add(key);
  }
  const hasDuplicates = duplicatePairs.size > 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ color: '#888', fontSize: 11 }}>Trading Pairs</span>
        <button
          onClick={handleAddRow}
          style={{
            padding: '3px 10px', background: '#1a1a2e', color: '#4caf50',
            border: '1px solid #333', borderRadius: 3, cursor: 'pointer',
            fontSize: 10, fontWeight: 600,
          }}
        >
          + Add Row
        </button>
      </div>

      {/* Header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 100px 32px',
        gap: 4, padding: '4px 8px', background: '#111128', borderRadius: '4px 4px 0 0',
        border: '1px solid #333', borderBottom: 'none', fontSize: 10, color: '#666',
      }}>
        <span>Symbol</span>
        <span>Timeframe</span>
        <span></span>
      </div>

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map((row) => {
          const isDuplicate = duplicatePairs.has(`${row.symbol}:${row.timeframe}`);
          return (
            <div key={row.id} style={{
              display: 'grid', gridTemplateColumns: '1fr 100px 32px',
              gap: 4, padding: '4px 8px', background: isDuplicate ? '#2a1a10' : '#0d0d18',
              border: `1px solid ${isDuplicate ? '#ff9800' : '#333'}`,
              borderTop: 'none',
              opacity: isDuplicate ? 0.7 : 1,
            }}>
              <select
                value={row.symbol}
                onChange={(e) => handleSymbolChange(row.id, e.target.value)}
                style={{
                  background: '#111128', color: '#e0e0e0', border: '1px solid #333',
                  borderRadius: 3, padding: '4px 6px', fontSize: 11, fontFamily: 'monospace',
                }}
              >
                {SYMBOLS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                value={row.timeframe}
                onChange={(e) => handleTimeframeChange(row.id, e.target.value)}
                style={{
                  background: '#111128', color: '#e0e0e0', border: '1px solid #333',
                  borderRadius: 3, padding: '4px 6px', fontSize: 11,
                }}
              >
                {TIMEFRAMES.map((tf) => (
                  <option key={tf.value} value={tf.value}>{tf.label}</option>
                ))}
              </select>
              <button
                onClick={() => handleRemoveRow(row.id)}
                disabled={rows.length <= 1}
                title={rows.length <= 1 ? 'Cannot remove last row' : 'Remove row'}
                style={{
                  padding: '4px', background: rows.length <= 1 ? '#222' : '#2a1520',
                  color: rows.length <= 1 ? '#555' : '#e94560',
                  border: 'none', borderRadius: 3, cursor: rows.length <= 1 ? 'default' : 'pointer',
                  fontSize: 11, fontWeight: 600,
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div style={{ marginTop: 6, fontSize: 10, color: hasDuplicates ? '#ff9800' : '#666' }}>
        {rows.length} pair{rows.length !== 1 ? 's' : ''} configured
        {hasDuplicates && ' ⚠ Duplicate pairs detected'}
        {rows.length === 0 && <span style={{ color: '#e94560' }}> — Add at least one pair</span>}
      </div>
    </div>
  );
}
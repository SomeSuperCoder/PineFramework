import { useEffect, useRef, useState } from 'react';
import type { BacktestResultResponse } from '../types';

interface BacktestResultsProps {
  result: BacktestResultResponse;
  onClose: () => void;
  onSelectTrade?: (tradeIndex: number) => void;
}

export function BacktestResults({ result, onClose, onSelectTrade }: BacktestResultsProps) {
  const equityCanvasRef = useRef<HTMLCanvasElement>(null);
  const [sortField, setSortField] = useState<string>('pnl');
  const [sortAsc, setSortAsc] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

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

    ctx.strokeStyle = '#2196f3';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const x = pad + (i / (points.length - 1)) * plotW;
      const y = pad + (1 - (equities[i] - minEquity) / equityRange) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#4caf50';
    ctx.font = '11px monospace';
    ctx.fillText(`Equity: $${maxEquity.toFixed(0)}`, pad, pad + 12);

    ctx.strokeStyle = '#e94560';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const x = pad + (i / (points.length - 1)) * plotW;
      const y = pad + plotH + pad + (1 - drawdowns[i] / (maxDD || 1)) * ddH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = '#ff9800';
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
    setShowExportMenu(false);
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
    <div
      className="backtest-results"
      style={{
        position: 'fixed',
        top: '60px',
        right: '20px',
        width: '600px',
        maxHeight: 'calc(100vh - 100px)',
        overflowY: 'auto',
        background: '#16213e',
        border: '1px solid #0f3460',
        borderRadius: '8px',
        padding: '20px',
        zIndex: 98,
        color: '#e0e0e0',
        fontSize: '13px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, color: '#2196f3' }}>Backtest Results</h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              style={{ padding: '6px 12px', background: '#0f3460', color: '#e0e0e0', border: '1px solid #2196f3', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
            >
              Export
            </button>
            {showExportMenu && (
              <div style={{ position: 'absolute', top: '100%', right: 0, background: '#1a1a2e', border: '1px solid #0f3460', borderRadius: '4px', zIndex: 10 }}>
                <button onClick={exportCSV} style={{ display: 'block', width: '100%', padding: '8px 16px', background: 'none', border: 'none', color: '#e0e0e0', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }}>
                  Export CSV
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ padding: '6px 12px', background: '#3a1a1a', color: '#e94560', border: '1px solid #e94560', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
          >
            Close
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
        <div style={{ background: '#1a1a2e', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#aaa' }}>Net Profit</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: metrics.totalPnl >= 0 ? '#4caf50' : '#e94560' }}>
            ${metrics.totalPnl.toFixed(2)}
          </div>
        </div>
        <div style={{ background: '#1a1a2e', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#aaa' }}>Win Rate</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{metrics.winRate.toFixed(1)}%</div>
        </div>
        <div style={{ background: '#1a1a2e', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#aaa' }}>Profit Factor</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{metrics.profitFactor.toFixed(2)}</div>
        </div>
        <div style={{ background: '#1a1a2e', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#aaa' }}>Sharpe</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{metrics.sharpeRatio.toFixed(2)}</div>
        </div>
        <div style={{ background: '#1a1a2e', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#aaa' }}>Max DD</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#e94560' }}>{metrics.maxDrawdownPercent.toFixed(1)}%</div>
        </div>
        <div style={{ background: '#1a1a2e', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#aaa' }}>Sortino</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{metrics.sortinoRatio.toFixed(2)}</div>
        </div>
        <div style={{ background: '#1a1a2e', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#aaa' }}>Total Trades</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{metrics.totalTrades}</div>
        </div>
        <div style={{ background: '#1a1a2e', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: '#aaa' }}>Commission</div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>${metrics.commission.toFixed(2)}</div>
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px', color: '#ff9800' }}>Equity & Drawdown</h4>
        <div style={{ width: '100%', height: '200px', background: '#1a1a2e', borderRadius: '6px' }}>
          <canvas ref={equityCanvasRef} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>

      <div>
        <h4 style={{ margin: '0 0 8px', color: '#ff9800' }}>
          Trade List ({sortedTrades.length} trades)
        </h4>
        {sortedTrades.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#666' }}>No trades</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#0f3460' }}>
                  <th style={{ padding: '4px 8px', cursor: 'pointer' }} onClick={() => toggleSort('direction')}>Dir{sortIndicator('direction')}</th>
                  <th style={{ padding: '4px 8px', cursor: 'pointer' }} onClick={() => toggleSort('entryPrice')}>Entry{sortIndicator('entryPrice')}</th>
                  <th style={{ padding: '4px 8px', cursor: 'pointer' }} onClick={() => toggleSort('exitPrice')}>Exit{sortIndicator('exitPrice')}</th>
                  <th style={{ padding: '4px 8px', cursor: 'pointer' }} onClick={() => toggleSort('pnl')}>PnL{sortIndicator('pnl')}</th>
                  <th style={{ padding: '4px 8px', cursor: 'pointer' }} onClick={() => toggleSort('pnlPercent')}>Return{sortIndicator('pnlPercent')}</th>
                  <th style={{ padding: '4px 8px', cursor: 'pointer' }} onClick={() => toggleSort('mae')}>MAE{sortIndicator('mae')}</th>
                  <th style={{ padding: '4px 8px', cursor: 'pointer' }} onClick={() => toggleSort('mfe')}>MFE{sortIndicator('mfe')}</th>
                  <th style={{ padding: '4px 8px', cursor: 'pointer' }} onClick={() => toggleSort('barsHeld')}>Bars{sortIndicator('barsHeld')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedTrades.map((t, i) => (
                  <tr
                    key={t.id}
                    onClick={() => onSelectTrade?.(i)}
                    style={{
                      borderBottom: '1px solid #0f3460',
                      cursor: onSelectTrade ? 'pointer' : 'default',
                      background: i % 2 === 0 ? '#1a1a2e' : '#16213e',
                    }}
                  >
                    <td style={{ padding: '4px 8px', color: t.direction === 'long' ? '#4caf50' : '#e94560' }}>
                      {t.direction === 'long' ? 'L' : 'S'}
                    </td>
                    <td style={{ padding: '4px 8px' }}>${t.entryPrice.toFixed(2)}</td>
                    <td style={{ padding: '4px 8px' }}>${t.exitPrice.toFixed(2)}</td>
                    <td style={{ padding: '4px 8px', color: t.pnl >= 0 ? '#4caf50' : '#e94560' }}>
                      ${t.pnl.toFixed(2)}
                    </td>
                    <td style={{ padding: '4px 8px', color: t.pnlPercent >= 0 ? '#4caf50' : '#e94560' }}>
                      {t.pnlPercent.toFixed(2)}%
                    </td>
                    <td style={{ padding: '4px 8px' }}>{t.mae.toFixed(2)}%</td>
                    <td style={{ padding: '4px 8px' }}>{t.mfe.toFixed(2)}%</td>
                    <td style={{ padding: '4px 8px' }}>{t.barsHeld}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

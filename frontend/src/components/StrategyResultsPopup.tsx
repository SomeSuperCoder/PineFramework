import { useState, useEffect, useRef, useCallback } from 'react';
import { useBacktest } from '../hooks/useBacktest';
import { extractStrategyParams } from '../utils/extractStrategyParams';
import { BacktestResults } from './BacktestResults';
import type { BacktestConfig } from '../types';

const defaultConfig: BacktestConfig = {
  initialCapital: 10000,
  commission: 0,
  slippage: 0,
  commissionType: 'percent',
  slippageType: 'ticks',
  defaultQty: 1,
  defaultQtyType: 'contracts',
  pyramiding: 0,
  marginLong: 1,
  marginShort: 1,
  currency: 'USD',
};

interface StrategyResultsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  timeframe: string;
  scriptSource: string;
}

export function StrategyResultsPopup({ isOpen, onClose, symbol, timeframe, scriptSource }: StrategyResultsPopupProps) {
  const [config, setConfig] = useState<BacktestConfig>({ ...defaultConfig });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const { status, progress, result, error, loading, submitBacktest, reset } = useBacktest();
  const hasSubmittedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      const scriptParams = extractStrategyParams(scriptSource);
      const merged = { ...defaultConfig, ...scriptParams };
      setConfig(merged);
      if (!hasSubmittedRef.current) {
        hasSubmittedRef.current = true;
        submitBacktest(
          symbol,
          timeframe,
          { ...merged, script: scriptSource },
        );
      }
    } else {
      hasSubmittedRef.current = false;
      reset();
    }
  }, [isOpen]);

  const handleRun = useCallback(() => {
    const scriptParams = extractStrategyParams(scriptSource);
    const merged = { ...defaultConfig, ...scriptParams, ...config };
    submitBacktest(
      symbol,
      timeframe,
      { ...merged, script: scriptSource },
      startDate || undefined,
      endDate || undefined,
    );
  }, [symbol, timeframe, config, scriptSource, startDate, endDate, submitBacktest]);

  if (!isOpen) return null;

  return (
    <div className="strategy-popup-overlay" onClick={onClose} style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 200,
    }}>
      <div className="strategy-popup" onClick={(e) => e.stopPropagation()} style={{
        width: '90vw',
        height: '90vh',
        background: '#16213e',
        border: '1px solid #0f3460',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: '#e0e0e0',
        fontSize: '13px',
      }}>
        <div className="strategy-popup-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid #0f3460',
          flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, color: '#2196f3', fontSize: '18px' }}>Backtest Results</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {status === 'running' && (
              <span style={{ fontSize: '12px', color: '#ff9800' }}>{progress}%</span>
            )}
            <button
              onClick={() => setShowSettings(!showSettings)}
              title="Backtest Settings"
              style={{
                padding: '6px 10px',
                background: showSettings ? '#0f3460' : 'transparent',
                color: '#e0e0e0',
                border: '1px solid #0f3460',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
                lineHeight: '1',
              }}
            >
              ⚙
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '6px 12px',
                background: '#3a1a1a',
                color: '#e94560',
                border: '1px solid #e94560',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="strategy-settings" style={{
            padding: '16px 20px',
            borderBottom: '1px solid #0f3460',
            background: '#1a1a2e',
            flexShrink: 0,
            maxHeight: '40vh',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Initial Capital</label>
                <input type="number" value={config.initialCapital} onChange={(e) => setConfig({ ...config, initialCapital: Number(e.target.value) })} style={{ width: '100%', padding: '6px', background: '#16213e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Commission</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input type="number" value={config.commission} onChange={(e) => setConfig({ ...config, commission: Number(e.target.value) })} style={{ flex: 1, padding: '6px', background: '#16213e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }} />
                  <select value={config.commissionType} onChange={(e) => setConfig({ ...config, commissionType: e.target.value as BacktestConfig['commissionType'] })} style={{ width: '100px', padding: '6px', background: '#16213e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }}>
                    <option value="percent">%</option>
                    <option value="fixed">Fixed</option>
                    <option value="per_contract">/Contract</option>
                    <option value="per_order">/Order</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Slippage</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input type="number" value={config.slippage} onChange={(e) => setConfig({ ...config, slippage: Number(e.target.value) })} style={{ flex: 1, padding: '6px', background: '#16213e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }} />
                  <select value={config.slippageType} onChange={(e) => setConfig({ ...config, slippageType: e.target.value as BacktestConfig['slippageType'] })} style={{ width: '100px', padding: '6px', background: '#16213e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }}>
                    <option value="ticks">Ticks</option>
                    <option value="points">Points</option>
                    <option value="percent">%</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Default Qty</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input type="number" value={config.defaultQty} onChange={(e) => setConfig({ ...config, defaultQty: Number(e.target.value) })} style={{ flex: 1, padding: '6px', background: '#16213e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }} />
                  <select value={config.defaultQtyType} onChange={(e) => setConfig({ ...config, defaultQtyType: e.target.value as BacktestConfig['defaultQtyType'] })} style={{ width: '120px', padding: '6px', background: '#16213e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }}>
                    <option value="contracts">Contracts</option>
                    <option value="percent_of_equity">% Equity</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Pyramiding</label>
                <input type="number" value={config.pyramiding} onChange={(e) => setConfig({ ...config, pyramiding: Number(e.target.value) })} style={{ width: '100%', padding: '6px', background: '#16213e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Margin (Long / Short)</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input type="number" value={config.marginLong} onChange={(e) => setConfig({ ...config, marginLong: Number(e.target.value) })} style={{ flex: 1, padding: '6px', background: '#16213e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }} placeholder="Long" />
                  <input type="number" value={config.marginShort} onChange={(e) => setConfig({ ...config, marginShort: Number(e.target.value) })} style={{ flex: 1, padding: '6px', background: '#16213e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }} placeholder="Short" />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Start Date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: '100%', padding: '6px', background: '#16213e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>End Date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: '100%', padding: '6px', background: '#16213e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }} />
              </div>
            </div>
            <button
              onClick={handleRun}
              disabled={loading}
              style={{
                marginTop: '12px',
                padding: '8px 20px',
                background: loading ? '#333' : '#2196f3',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 'bold',
              }}
            >
              {loading ? 'Running...' : 'Run Backtest'}
            </button>
          </div>
        )}

        <div className="strategy-popup-content" style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
        }}>
          {status === 'running' && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
              <div style={{ width: '60%', margin: '0 auto 12px', height: '8px', background: '#1a1a2e', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: '#2196f3', borderRadius: '4px', transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ fontSize: '14px', color: '#aaa' }}>Running backtest... {progress}%</div>
            </div>
          )}
          {status === 'failed' && error && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#e94560' }}>
              Backtest failed: {error}
            </div>
          )}
          {status === 'completed' && result && (
            <BacktestResults result={result} onClose={() => {}} />
          )}
          {status === null && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
              Starting backtest...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

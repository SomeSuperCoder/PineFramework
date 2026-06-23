import { useState, useEffect, useRef } from 'react';
import { useBacktest } from '../hooks/useBacktest';
import { extractStrategyParams } from '../utils/extractStrategyParams';
import type { BacktestConfig, BacktestResultResponse } from '../types';

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

interface BacktestPanelProps {
  symbol: string;
  timeframe: string;
  scriptSource?: string;
  onResult: (result: BacktestResultResponse) => void;
}

export function BacktestPanel({ symbol, timeframe, scriptSource, onResult }: BacktestPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<BacktestConfig>({ ...defaultConfig });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loadedFromScript, setLoadedFromScript] = useState(false);
  const { status, progress, result, error, loading, submitBacktest } = useBacktest();
  const prevResultRef = useRef<BacktestResultResponse | null>(null);

  useEffect(() => {
    if (!scriptSource || isOpen) return;
    const scriptParams = extractStrategyParams(scriptSource);
    if (Object.keys(scriptParams).length > 0) {
      setConfig((prev) => ({ ...prev, ...scriptParams }));
      setLoadedFromScript(true);
    }
  }, [scriptSource, isOpen]);

  useEffect(() => {
    if (result && result !== prevResultRef.current) {
      prevResultRef.current = result;
      onResult(result);
    }
  }, [result, onResult]);

  const handleSubmit = () => {
    submitBacktest(
      symbol,
      timeframe,
      { ...config, script: scriptSource },
      startDate || undefined,
      endDate || undefined,
    );
  };

  return (
    <>
      <button
        className="backtest-button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '80px',
          right: '20px',
          zIndex: 100,
          padding: '10px 16px',
          background: '#0f3460',
          color: '#e0e0e0',
          border: '1px solid #2196f3',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        {isOpen ? '✕ Close Backtest' : '📊 Backtest'}
      </button>

      {isOpen && (
        <div
          className="backtest-panel"
          style={{
            position: 'fixed',
            top: '60px',
            right: '20px',
            width: '380px',
            maxHeight: 'calc(100vh - 100px)',
            overflowY: 'auto',
            background: '#16213e',
            border: '1px solid #0f3460',
            borderRadius: '8px',
            padding: '20px',
            zIndex: 99,
            color: '#e0e0e0',
            fontSize: '13px',
          }}
        >
          <h3 style={{ margin: '0 0 16px', color: '#2196f3' }}>Backtest Configuration</h3>
          {loadedFromScript && (
            <div style={{
              padding: '6px 10px',
              marginBottom: '12px',
              background: '#0a2e1a',
              border: '1px solid #4caf50',
              borderRadius: '4px',
              color: '#4caf50',
              fontSize: '11px',
            }}>
              Settings auto-loaded from your strategy() declaration. You can override any value below.
            </div>
          )}

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ width: '100%', padding: '6px', background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ width: '100%', padding: '6px', background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }}
            />
          </div>

          <fieldset style={{ border: '1px solid #0f3460', borderRadius: '6px', padding: '12px', marginBottom: '12px' }}>
            <legend style={{ color: '#2196f3', padding: '0 6px' }}>Broker Emulator</legend>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Initial Capital</label>
              <input
                type="number"
                value={config.initialCapital}
                onChange={(e) => setConfig({ ...config, initialCapital: Number(e.target.value) })}
                style={{ width: '100%', padding: '6px', background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Commission</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  value={config.commission}
                  onChange={(e) => setConfig({ ...config, commission: Number(e.target.value) })}
                  style={{ flex: 1, padding: '6px', background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }}
                />
                <select
                  value={config.commissionType}
                  onChange={(e) => setConfig({ ...config, commissionType: e.target.value as BacktestConfig['commissionType'] })}
                  style={{ width: '120px', padding: '6px', background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }}
                >
                  <option value="percent">Percent</option>
                  <option value="fixed">Fixed</option>
                  <option value="per_contract">Per Contract</option>
                  <option value="per_order">Per Order</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Slippage</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  value={config.slippage}
                  onChange={(e) => setConfig({ ...config, slippage: Number(e.target.value) })}
                  style={{ flex: 1, padding: '6px', background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }}
                />
                <select
                  value={config.slippageType}
                  onChange={(e) => setConfig({ ...config, slippageType: e.target.value as BacktestConfig['slippageType'] })}
                  style={{ width: '120px', padding: '6px', background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }}
                >
                  <option value="ticks">Ticks</option>
                  <option value="points">Points</option>
                  <option value="percent">Percent</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Default Quantity</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  value={config.defaultQty}
                  onChange={(e) => setConfig({ ...config, defaultQty: Number(e.target.value) })}
                  style={{ flex: 1, padding: '6px', background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }}
                />
                <select
                  value={config.defaultQtyType}
                  onChange={(e) => setConfig({ ...config, defaultQtyType: e.target.value as BacktestConfig['defaultQtyType'] })}
                  style={{ width: '160px', padding: '6px', background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }}
                >
                  <option value="contracts">Contracts</option>
                  <option value="percent_of_equity">% of Equity</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Pyramiding</label>
              <input
                type="number"
                value={config.pyramiding}
                onChange={(e) => setConfig({ ...config, pyramiding: Number(e.target.value) })}
                style={{ width: '100%', padding: '6px', background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Margin (Long / Short)</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  value={config.marginLong}
                  onChange={(e) => setConfig({ ...config, marginLong: Number(e.target.value) })}
                  style={{ flex: 1, padding: '6px', background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }}
                  placeholder="Long"
                />
                <input
                  type="number"
                  value={config.marginShort}
                  onChange={(e) => setConfig({ ...config, marginShort: Number(e.target.value) })}
                  style={{ flex: 1, padding: '6px', background: '#1a1a2e', color: '#e0e0e0', border: '1px solid #0f3460', borderRadius: '4px' }}
                  placeholder="Short"
                />
              </div>
            </div>
          </fieldset>

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px',
              background: loading ? '#333' : '#2196f3',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            {loading ? `Running... ${progress}%` : 'Run Backtest'}
          </button>

          {status === 'running' && (
            <div style={{ marginTop: '12px' }}>
              <div style={{
                width: '100%',
                height: '8px',
                background: '#1a1a2e',
                borderRadius: '4px',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: '#2196f3',
                  borderRadius: '4px',
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <div style={{ textAlign: 'center', marginTop: '4px', color: '#aaa', fontSize: '12px' }}>
                Processing... {progress}%
              </div>
            </div>
          )}

          {status === 'failed' && error && (
            <div style={{ marginTop: '12px', padding: '8px', background: '#3a1a1a', borderRadius: '4px', color: '#e94560', fontSize: '12px' }}>
              {error}
            </div>
          )}
        </div>
      )}
    </>
  );
}

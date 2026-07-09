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
  defaultQty: 20,
  defaultQtyType: 'percent_of_equity',
  pyramiding: 0,
  marginLong: 1,
  marginShort: 1,
  currency: 'USD',
};

type DateRangeMode = 'days_back' | 'traditional';

interface SavedSettings {
  config: BacktestConfig;
  daysBack: number;
  dateRangeMode: DateRangeMode;
  startDate: string;
  endDate: string;
}

const STORAGE_KEY = 'pine-backtest-settings';

function loadSavedSettings(): SavedSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedSettings;
  } catch {
    return null;
  }
}

function saveSettings(settings: SavedSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage may be unavailable
  }
}

interface StrategyResultsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  timeframe: string;
  scriptSource: string;
}

export function StrategyResultsPopup({ isOpen, onClose, symbol, timeframe, scriptSource }: StrategyResultsPopupProps) {
  const saved = loadSavedSettings();
  const [config, setConfig] = useState<BacktestConfig>(() => {
    if (saved) return { ...defaultConfig, ...saved.config };
    return { ...defaultConfig };
  });
  const [daysBack, setDaysBack] = useState<number>(() => saved?.daysBack ?? 30);
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>(() => saved?.dateRangeMode ?? 'days_back');
  const [startDate, setStartDate] = useState(() => saved?.startDate ?? '');
  const [endDate, setEndDate] = useState(() => saved?.endDate ?? '');
  const [showSettings, setShowSettings] = useState(true);
  const [hasRunBacktest, setHasRunBacktest] = useState(false);
  const { status, progress, result, error, loading, submitBacktest, reset } = useBacktest();
  const hasSubmittedRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      const scriptParams = extractStrategyParams(scriptSource);
      const merged = { ...defaultConfig, ...scriptParams };
      setConfig(merged);
      setShowSettings(true);
      hasSubmittedRef.current = false;

      const savedSettings = loadSavedSettings();
      if (savedSettings) {
        setDaysBack(savedSettings.daysBack);
        setDateRangeMode(savedSettings.dateRangeMode);
        setStartDate(savedSettings.startDate);
        setEndDate(savedSettings.endDate);
        setHasRunBacktest(false);
      }
    } else {
      hasSubmittedRef.current = false;
      setHasRunBacktest(false);
      reset();
    }
  }, [isOpen, scriptSource, reset]);

  const persistSettings = useCallback((newConfig: BacktestConfig, newDaysBack: number, newMode: DateRangeMode, newStartDate: string, newEndDate: string) => {
    saveSettings({ config: newConfig, daysBack: newDaysBack, dateRangeMode: newMode, startDate: newStartDate, endDate: newEndDate });
  }, []);

  const handleConfigChange = useCallback((updated: BacktestConfig) => {
    setConfig(updated);
    persistSettings(updated, daysBack, dateRangeMode, startDate, endDate);
  }, [daysBack, dateRangeMode, startDate, endDate, persistSettings]);

  const handleDaysBackChange = useCallback((val: number) => {
    setDaysBack(val);
    persistSettings(config, val, dateRangeMode, startDate, endDate);
  }, [config, dateRangeMode, startDate, endDate, persistSettings]);

  const handleModeChange = useCallback((mode: DateRangeMode) => {
    setDateRangeMode(mode);
    persistSettings(config, daysBack, mode, startDate, endDate);
  }, [config, daysBack, startDate, endDate, persistSettings]);

  const handleStartDateChange = useCallback((val: string) => {
    setStartDate(val);
    persistSettings(config, daysBack, dateRangeMode, val, endDate);
  }, [config, daysBack, dateRangeMode, endDate, persistSettings]);

  const handleEndDateChange = useCallback((val: string) => {
    setEndDate(val);
    persistSettings(config, daysBack, dateRangeMode, startDate, val);
  }, [config, daysBack, dateRangeMode, startDate, persistSettings]);

  const handleRun = useCallback(() => {
    hasSubmittedRef.current = true;
    setShowSettings(false);
    setHasRunBacktest(true);

    let effectiveStartDate = startDate || undefined;
    let effectiveEndDate = endDate || undefined;

    if (dateRangeMode === 'days_back' && daysBack > 0) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - daysBack);
      effectiveStartDate = start.toISOString().split('T')[0];
      effectiveEndDate = end.toISOString().split('T')[0];
    }

    submitBacktest(
      symbol,
      timeframe,
      { ...config, script: scriptSource },
      effectiveStartDate,
      effectiveEndDate,
    );
  }, [symbol, timeframe, config, scriptSource, startDate, endDate, dateRangeMode, daysBack, submitBacktest]);

  if (!isOpen) return null;

  const settingsDisabled = !hasRunBacktest;

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
        background: '#0f1520',
        border: '1px solid #111128',
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
          borderBottom: '1px solid #111128',
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
                background: showSettings ? '#111128' : 'transparent',
                color: '#e0e0e0',
                border: '1px solid #111128',
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
            borderBottom: '1px solid #111128',
            background: '#0d0d18',
            flexShrink: 0,
            maxHeight: '40vh',
            overflowY: 'auto',
          }}>
            {settingsDisabled && (
              <div style={{ marginBottom: '12px', padding: '8px 12px', background: '#1a1a0d', border: '1px solid #ff9800', borderRadius: '4px', color: '#ff9800', fontSize: '12px' }}>
                Settings are read-only until you run your first backtest.
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Initial Capital</label>
                <input type="number" value={config.initialCapital} disabled={settingsDisabled} onChange={(e) => handleConfigChange({ ...config, initialCapital: Number(e.target.value) })} style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px', opacity: settingsDisabled ? 0.5 : 1 }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Commission</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input type="number" value={config.commission} disabled={settingsDisabled} onChange={(e) => handleConfigChange({ ...config, commission: Number(e.target.value) })} style={{ flex: 1, padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px', opacity: settingsDisabled ? 0.5 : 1 }} />
                  <select value={config.commissionType} disabled={settingsDisabled} onChange={(e) => handleConfigChange({ ...config, commissionType: e.target.value as BacktestConfig['commissionType'] })} style={{ width: '100px', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px', opacity: settingsDisabled ? 0.5 : 1 }}>
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
                  <input type="number" value={config.slippage} disabled={settingsDisabled} onChange={(e) => handleConfigChange({ ...config, slippage: Number(e.target.value) })} style={{ flex: 1, padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px', opacity: settingsDisabled ? 0.5 : 1 }} />
                  <select value={config.slippageType} disabled={settingsDisabled} onChange={(e) => handleConfigChange({ ...config, slippageType: e.target.value as BacktestConfig['slippageType'] })} style={{ width: '100px', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px', opacity: settingsDisabled ? 0.5 : 1 }}>
                    <option value="ticks">Ticks</option>
                    <option value="points">Points</option>
                    <option value="percent">%</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Default Qty</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input type="number" value={config.defaultQty} disabled={settingsDisabled} onChange={(e) => handleConfigChange({ ...config, defaultQty: Number(e.target.value) })} style={{ flex: 1, padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px', opacity: settingsDisabled ? 0.5 : 1 }} />
                  <select value={config.defaultQtyType} disabled={settingsDisabled} onChange={(e) => handleConfigChange({ ...config, defaultQtyType: e.target.value as BacktestConfig['defaultQtyType'] })} style={{ width: '120px', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px', opacity: settingsDisabled ? 0.5 : 1 }}>
                    <option value="contracts">Contracts</option>
                    <option value="percent_of_equity">% Equity</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Pyramiding</label>
                <input type="number" value={config.pyramiding} disabled={settingsDisabled} onChange={(e) => handleConfigChange({ ...config, pyramiding: Number(e.target.value) })} style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px', opacity: settingsDisabled ? 0.5 : 1 }} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Margin (Long / Short)</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input type="number" value={config.marginLong} disabled={settingsDisabled} onChange={(e) => handleConfigChange({ ...config, marginLong: Number(e.target.value) })} style={{ flex: 1, padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px', opacity: settingsDisabled ? 0.5 : 1 }} placeholder="Long" />
                  <input type="number" value={config.marginShort} disabled={settingsDisabled} onChange={(e) => handleConfigChange({ ...config, marginShort: Number(e.target.value) })} style={{ flex: 1, padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px', opacity: settingsDisabled ? 0.5 : 1 }} placeholder="Short" />
                </div>
              </div>
            </div>

            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Date Range</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button
                  onClick={() => handleModeChange('days_back')}
                  disabled={settingsDisabled}
                  style={{
                    padding: '4px 12px',
                    background: dateRangeMode === 'days_back' ? '#2196f3' : '#111128',
                    color: '#e0e0e0',
                    border: '1px solid #111128',
                    borderRadius: '4px',
                    cursor: settingsDisabled ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    opacity: settingsDisabled ? 0.5 : 1,
                  }}
                >
                  Days Back
                </button>
                <button
                  onClick={() => handleModeChange('traditional')}
                  disabled={settingsDisabled}
                  style={{
                    padding: '4px 12px',
                    background: dateRangeMode === 'traditional' ? '#2196f3' : '#111128',
                    color: '#e0e0e0',
                    border: '1px solid #111128',
                    borderRadius: '4px',
                    cursor: settingsDisabled ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    opacity: settingsDisabled ? 0.5 : 1,
                  }}
                >
                  Begin / End
                </button>
              </div>
              {dateRangeMode === 'days_back' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    min={1}
                    value={daysBack}
                    disabled={settingsDisabled}
                    onChange={(e) => handleDaysBackChange(Number(e.target.value) || 1)}
                    style={{ width: '80px', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px', opacity: settingsDisabled ? 0.5 : 1 }}
                  />
                  <span style={{ color: '#aaa', fontSize: '12px' }}>days back from today</span>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '4px', color: '#aaa', fontSize: '11px' }}>Start Date</label>
                    <input type="date" value={startDate} disabled={settingsDisabled} onChange={(e) => handleStartDateChange(e.target.value)} style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px', opacity: settingsDisabled ? 0.5 : 1 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '4px', color: '#aaa', fontSize: '11px' }}>End Date</label>
                    <input type="date" value={endDate} disabled={settingsDisabled} onChange={(e) => handleEndDateChange(e.target.value)} style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px', opacity: settingsDisabled ? 0.5 : 1 }} />
                  </div>
                </div>
              )}
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
              <div style={{ width: '60%', margin: '0 auto 12px', height: '8px', background: '#0d0d18', borderRadius: '4px', overflow: 'hidden' }}>
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

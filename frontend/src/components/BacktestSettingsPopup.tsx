import { useState, useCallback } from 'react';
import { extractStrategyParams } from '../utils/extractStrategyParams';
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

export type DateRangeMode = 'days_back' | 'traditional';

export interface SavedSettings {
  config: BacktestConfig;
  daysBack: number;
  dateRangeMode: DateRangeMode;
  startDate: string;
  endDate: string;
}

const STORAGE_KEY = 'pine-backtest-settings';

export function loadSavedSettings(): SavedSettings | null {
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

export interface BacktestSettingsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onRun: (config: BacktestConfig, startDate?: string, endDate?: string) => void;
  scriptSource: string;
}

export function BacktestSettingsPopup({ isOpen, onClose, onRun, scriptSource }: BacktestSettingsPopupProps) {
  const saved = loadSavedSettings();
  const [config, setConfig] = useState<BacktestConfig>(() => {
    const scriptParams = extractStrategyParams(scriptSource);
    if (saved) return { ...defaultConfig, ...scriptParams, ...saved.config };
    return { ...defaultConfig, ...scriptParams };
  });
  const [daysBack, setDaysBack] = useState<number>(() => saved?.daysBack ?? 30);
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>(() => saved?.dateRangeMode ?? 'days_back');
  const [startDate, setStartDate] = useState(() => saved?.startDate ?? '');
  const [endDate, setEndDate] = useState(() => saved?.endDate ?? '');

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
    let effectiveStartDate = startDate || undefined;
    let effectiveEndDate = endDate || undefined;

    if (dateRangeMode === 'days_back' && daysBack > 0) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - daysBack);
      effectiveStartDate = start.toISOString().split('T')[0];
      effectiveEndDate = end.toISOString().split('T')[0];
    }

    onRun(config, effectiveStartDate, effectiveEndDate);
  }, [config, startDate, endDate, dateRangeMode, daysBack, onRun]);

  if (!isOpen) return null;

  return (
    <div className="backtest-settings-overlay" onClick={onClose} style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 210,
    }}>
      <div className="backtest-settings-popup" onClick={(e) => e.stopPropagation()} style={{
        width: '600px',
        maxHeight: '85vh',
        background: '#0f1520',
        border: '1px solid #111128',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: '#e0e0e0',
        fontSize: '13px',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid #111128',
          flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, color: '#2196f3', fontSize: '18px' }}>Backtest Settings</h2>
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

        <div style={{
          padding: '16px 20px',
          overflowY: 'auto',
          flex: 1,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Initial Capital</label>
              <input type="number" value={config.initialCapital} onChange={(e) => handleConfigChange({ ...config, initialCapital: Number(e.target.value) })} style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Commission</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input type="number" value={config.commission} onChange={(e) => handleConfigChange({ ...config, commission: Number(e.target.value) })} style={{ flex: 1, padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }} />
                <select value={config.commissionType} onChange={(e) => handleConfigChange({ ...config, commissionType: e.target.value as BacktestConfig['commissionType'] })} style={{ width: '100px', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }}>
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
                <input type="number" value={config.slippage} onChange={(e) => handleConfigChange({ ...config, slippage: Number(e.target.value) })} style={{ flex: 1, padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }} />
                <select value={config.slippageType} onChange={(e) => handleConfigChange({ ...config, slippageType: e.target.value as BacktestConfig['slippageType'] })} style={{ width: '100px', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }}>
                  <option value="ticks">Ticks</option>
                  <option value="points">Points</option>
                  <option value="percent">%</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Default Qty</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input type="number" value={config.defaultQty} onChange={(e) => handleConfigChange({ ...config, defaultQty: Number(e.target.value) })} style={{ flex: 1, padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }} />
                <select value={config.defaultQtyType} onChange={(e) => handleConfigChange({ ...config, defaultQtyType: e.target.value as BacktestConfig['defaultQtyType'] })} style={{ width: '120px', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }}>
                  <option value="contracts">Contracts</option>
                  <option value="percent_of_equity">% Equity</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Pyramiding</label>
              <input type="number" value={config.pyramiding} onChange={(e) => handleConfigChange({ ...config, pyramiding: Number(e.target.value) })} style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Margin (Long / Short)</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input type="number" value={config.marginLong} onChange={(e) => handleConfigChange({ ...config, marginLong: Number(e.target.value) })} style={{ flex: 1, padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }} placeholder="Long" />
                <input type="number" value={config.marginShort} onChange={(e) => handleConfigChange({ ...config, marginShort: Number(e.target.value) })} style={{ flex: 1, padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }} placeholder="Short" />
              </div>
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Date Range</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button
                onClick={() => handleModeChange('days_back')}
                style={{
                  padding: '4px 12px',
                  background: dateRangeMode === 'days_back' ? '#2196f3' : '#111128',
                  color: '#e0e0e0',
                  border: '1px solid #111128',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Days Back
              </button>
              <button
                onClick={() => handleModeChange('traditional')}
                style={{
                  padding: '4px 12px',
                  background: dateRangeMode === 'traditional' ? '#2196f3' : '#111128',
                  color: '#e0e0e0',
                  border: '1px solid #111128',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
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
                  onChange={(e) => handleDaysBackChange(Number(e.target.value) || 1)}
                  style={{ width: '80px', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }}
                />
                <span style={{ color: '#aaa', fontSize: '12px' }}>days back from today</span>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', color: '#aaa', fontSize: '11px' }}>Start Date</label>
                  <input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)} style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', color: '#aaa', fontSize: '11px' }}>End Date</label>
                  <input type="date" value={endDate} onChange={(e) => handleEndDateChange(e.target.value)} style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }} />
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
            <button
              onClick={handleRun}
              style={{
                padding: '8px 24px',
                background: '#2196f3',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 'bold',
              }}
            >
              Run Backtest
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '8px 24px',
                background: '#111128',
                color: '#e0e0e0',
                border: '1px solid #111128',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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

interface UserSettings {
  initialCapital: number;
  commission: number;
  daysBack: number;
  dateRangeMode: DateRangeMode;
  startDate: string;
  endDate: string;
}

const STORAGE_KEY = 'pine-backtest-settings';

function loadUserSettings(): UserSettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserSettings;
  } catch {
    return null;
  }
}

function saveUserSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage may be unavailable
  }
}

function buildConfig(scriptParams: Partial<BacktestConfig>, user: UserSettings): BacktestConfig {
  return {
    ...defaultConfig,
    ...scriptParams,
    initialCapital: user.initialCapital,
    commission: user.commission,
  };
}

export interface BacktestSettingsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onRun: (config: BacktestConfig, startDate?: string, endDate?: string) => void;
  scriptSource: string;
}

export function BacktestSettingsPopup({ isOpen, onClose, onRun, scriptSource }: BacktestSettingsPopupProps) {
  const saved = loadUserSettings();
  const scriptParams = extractStrategyParams(scriptSource);

  const [initialCapital, setInitialCapital] = useState<number>(() => saved?.initialCapital ?? scriptParams.initialCapital ?? defaultConfig.initialCapital);
  const [commission, setCommission] = useState<number>(() => saved?.commission ?? scriptParams.commission ?? defaultConfig.commission);
  const [daysBack, setDaysBack] = useState<number>(() => saved?.daysBack ?? 30);
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>(() => saved?.dateRangeMode ?? 'days_back');
  const [startDate, setStartDate] = useState(() => saved?.startDate ?? '');
  const [endDate, setEndDate] = useState(() => saved?.endDate ?? '');

  const persist = useCallback((updates: Partial<UserSettings>) => {
    const current: UserSettings = { initialCapital, commission, daysBack, dateRangeMode, startDate, endDate, ...updates };
    saveUserSettings(current);
  }, [initialCapital, commission, daysBack, dateRangeMode, startDate, endDate]);

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

    const config = buildConfig(scriptParams, { initialCapital, commission, daysBack, dateRangeMode, startDate, endDate });
    onRun(config, effectiveStartDate, effectiveEndDate);
  }, [scriptParams, initialCapital, commission, startDate, endDate, dateRangeMode, daysBack, onRun]);

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
        width: '500px',
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Initial Capital</label>
              <input
                type="number"
                value={initialCapital}
                onChange={(e) => { const v = Number(e.target.value); setInitialCapital(v); persist({ initialCapital: v }); }}
                style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Commission</label>
              <input
                type="number"
                value={commission}
                onChange={(e) => { const v = Number(e.target.value); setCommission(v); persist({ commission: v }); }}
                style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Date Range</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button
                  onClick={() => { setDateRangeMode('days_back'); persist({ dateRangeMode: 'days_back' }); }}
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
                  onClick={() => { setDateRangeMode('traditional'); persist({ dateRangeMode: 'traditional' }); }}
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
                    onChange={(e) => { const v = Number(e.target.value) || 1; setDaysBack(v); persist({ daysBack: v }); }}
                    style={{ width: '80px', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }}
                  />
                  <span style={{ color: '#aaa', fontSize: '12px' }}>days back from today</span>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '4px', color: '#aaa', fontSize: '11px' }}>Start Date</label>
                    <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); persist({ startDate: e.target.value }); }} style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '4px', color: '#aaa', fontSize: '11px' }}>End Date</label>
                    <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); persist({ endDate: e.target.value }); }} style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }} />
                  </div>
                </div>
              )}
            </div>
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

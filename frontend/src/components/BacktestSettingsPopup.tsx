import { useState, useCallback } from 'react';
import { extractStrategyParams } from '../utils/extractStrategyParams';
import type { BacktestConfig, CommissionMethodId, DateRangeMode } from '../types';
import { BacktestGeneralSettings } from './BacktestGeneralSettings.js';
import { BacktestCommissionSettings } from './BacktestCommissionSettings.js';

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

interface UserSettings {
  initialCapital: number;
  commission: number;
  daysBack: number;
  dateRangeMode: DateRangeMode;
  startDate: string;
  endDate: string;
  commissionMethod?: CommissionMethodId;
  commissionMethodSettings?: Record<string, unknown> | null;
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
  const base = {
    ...defaultConfig,
    ...scriptParams,
    initialCapital: user.initialCapital,
    commission: user.commission,
  };

  if (user.commissionMethod) {
    return {
      ...base,
      commissionMethod: user.commissionMethod,
      commissionMethodSettings: user.commissionMethodSettings ?? null,
    };
  }

  return base;
}

export interface BacktestSettingsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onRun: (config: BacktestConfig, startDate?: string, endDate?: string) => void;
  scriptSource: string;
  timeframe: string;
  /** Current trading pair symbol (e.g. "SOLUSDT"). Used for Jupiter fee tier auto-detection. */
  symbol?: string;
}

export function BacktestSettingsPopup({ isOpen, onClose, onRun, scriptSource, timeframe, symbol }: BacktestSettingsPopupProps) {
  const saved = loadUserSettings();
  const scriptParams = extractStrategyParams(scriptSource);

  const [initialCapital, setInitialCapital] = useState<number>(() => saved?.initialCapital ?? scriptParams.initialCapital ?? defaultConfig.initialCapital);
  const [commission, setCommission] = useState<number>(() => saved?.commission ?? scriptParams.commission ?? defaultConfig.commission);
  const [daysBack, setDaysBack] = useState<number>(() => saved?.daysBack ?? 30);
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>(() => saved?.dateRangeMode ?? 'days_back');
  const [startDate, setStartDate] = useState(() => saved?.startDate ?? '');
  const [endDate, setEndDate] = useState(() => saved?.endDate ?? '');

  const [commissionMethod, setCommissionMethod] = useState<CommissionMethodId | undefined>(
    () => saved?.commissionMethod ?? undefined,
  );
  const [commissionMethodSettings, setCommissionMethodSettings] = useState<Record<string, unknown> | null>(
    () => saved?.commissionMethodSettings ?? null,
  );

  const [barsExceedLimit, setBarsExceedLimit] = useState(false);

  const persist = useCallback((updates: Partial<UserSettings>) => {
    const current: UserSettings = {
      initialCapital, commission, daysBack, dateRangeMode, startDate, endDate,
      commissionMethod, commissionMethodSettings,
      ...updates,
    };
    saveUserSettings(current);
  }, [initialCapital, commission, daysBack, dateRangeMode, startDate, endDate, commissionMethod, commissionMethodSettings]);

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

    const config = buildConfig(scriptParams, {
      initialCapital, commission, daysBack, dateRangeMode, startDate, endDate,
      commissionMethod, commissionMethodSettings,
    });
    onRun(config, effectiveStartDate, effectiveEndDate);
  }, [scriptParams, initialCapital, commission, startDate, endDate, dateRangeMode, daysBack, commissionMethod, commissionMethodSettings, onRun]);

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
            <BacktestGeneralSettings
              initialCapital={initialCapital}
              onInitialCapitalChange={(v) => { setInitialCapital(v); persist({ initialCapital: v }); }}
              daysBack={daysBack}
              onDaysBackChange={(v) => { setDaysBack(v); persist({ daysBack: v }); }}
              dateRangeMode={dateRangeMode}
              onDateRangeModeChange={(mode) => { setDateRangeMode(mode); persist({ dateRangeMode: mode }); }}
              startDate={startDate}
              onStartDateChange={(d) => { setStartDate(d); persist({ startDate: d }); }}
              endDate={endDate}
              onEndDateChange={(d) => { setEndDate(d); persist({ endDate: d }); }}
              timeframe={timeframe}
              onBarsExceededChange={setBarsExceedLimit}
            />

            <BacktestCommissionSettings
              commission={commission}
              onCommissionChange={(v) => { setCommission(v); persist({ commission: v }); }}
              commissionMethod={commissionMethod}
              onCommissionMethodChange={(method) => { setCommissionMethod(method); }}
              commissionMethodSettings={commissionMethodSettings}
              onCommissionMethodSettingsChange={(settings) => { setCommissionMethodSettings(settings); }}
              symbol={symbol}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
            <button
              onClick={handleRun}
              disabled={barsExceedLimit}
              style={{
                padding: '8px 24px',
                background: barsExceedLimit ? '#555' : '#2196f3',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: barsExceedLimit ? 'not-allowed' : 'pointer',
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

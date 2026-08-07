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
  return {
    ...defaultConfig,
    ...scriptParams,
    initialCapital: user.initialCapital,
    commission: 0,
    commissionMethod: user.commissionMethod ?? 'jupiter_manual',
    commissionMethodSettings: user.commissionMethodSettings ?? null,
  };
}

export interface BacktestPanelProps {
  onRun: (config: BacktestConfig, startDate?: string, endDate?: string) => void;
  onClose: () => void;
  scriptSource: string;
  timeframe: string;
  symbol?: string;
}

export function BacktestPanel({ onRun, onClose, scriptSource, timeframe, symbol }: BacktestPanelProps) {
  const saved = loadUserSettings();
  const scriptParams = extractStrategyParams(scriptSource);

  const [initialCapital, setInitialCapital] = useState<number>(() => saved?.initialCapital ?? scriptParams.initialCapital ?? defaultConfig.initialCapital);
  const [daysBack, setDaysBack] = useState<number>(() => saved?.daysBack ?? 30);
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>(() => saved?.dateRangeMode ?? 'days_back');
  const [startDate, setStartDate] = useState(() => saved?.startDate ?? '');
  const [endDate, setEndDate] = useState(() => saved?.endDate ?? '');

  const [commissionMethod, setCommissionMethod] = useState<CommissionMethodId>(
    () => saved?.commissionMethod ?? 'jupiter_manual',
  );
  const [commissionMethodSettings, setCommissionMethodSettings] = useState<Record<string, unknown> | null>(
    () => saved?.commissionMethodSettings ?? { dexFeeBps: 25, solPriceUsd: 150 },
  );

  const [barsExceedLimit, setBarsExceedLimit] = useState(false);

  const persist = useCallback((updates: Partial<UserSettings>) => {
    const current: UserSettings = {
      initialCapital, daysBack, dateRangeMode, startDate, endDate,
      commissionMethod, commissionMethodSettings,
      ...updates,
    };
    saveUserSettings(current);
  }, [initialCapital, daysBack, dateRangeMode, startDate, endDate, commissionMethod, commissionMethodSettings]);

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
      initialCapital, daysBack, dateRangeMode, startDate, endDate,
      commissionMethod, commissionMethodSettings,
    });
    onRun(config, effectiveStartDate, effectiveEndDate);
  }, [scriptParams, initialCapital, startDate, endDate, dateRangeMode, daysBack, commissionMethod, commissionMethodSettings, onRun]);

  return (
    <div
      className="backtest-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: 'auto',
        background: '#0f1520',
        border: '1px solid #111128',
        borderRadius: '8px',
        padding: '20px',
        color: '#e0e0e0',
        fontSize: '13px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 16px' }}>
        <button
          onClick={onClose}
          aria-label="Back to dashboard"
          style={{
            background: 'none',
            border: '1px solid #333',
            borderRadius: '4px',
            color: '#aaa',
            cursor: 'pointer',
            padding: '4px 8px',
            fontSize: '13px',
          }}
        >
          ← Back
        </button>
        <h3 style={{ margin: 0, color: '#2196f3' }}>Backtest Settings</h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
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
          commissionMethod={commissionMethod}
          onCommissionMethodChange={setCommissionMethod}
          commissionMethodSettings={commissionMethodSettings}
          onCommissionMethodSettingsChange={setCommissionMethodSettings}
          symbol={symbol}
        />

        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
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
        </div>
      </div>
    </div>
  );
}

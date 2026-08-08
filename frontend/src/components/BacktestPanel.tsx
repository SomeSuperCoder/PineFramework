import { useState, useCallback } from 'react';
import { extractStrategyParams } from '../utils/extractStrategyParams';
import type { BacktestConfig, CommissionMethodId, DateRangeMode } from '../types';
import { BacktestGeneralSettings } from './BacktestGeneralSettings.js';
import { BacktestCommissionSettings } from './BacktestCommissionSettings.js';
import { StrategySelector } from './StrategySelector.js';
import { tokens } from '../theme/tokens';

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

export interface SelectedBacktestStrategy {
  id: string;
  name: string;
  source: string;
}

export interface BacktestPanelProps {
  onRun: (config: BacktestConfig, strategy: SelectedBacktestStrategy, startDate?: string, endDate?: string) => void;
  onClose: () => void;
  timeframe: string;
  symbol?: string;
  backendUrl: string;
}

export function BacktestPanel({ onRun, onClose, timeframe, symbol, backendUrl }: BacktestPanelProps) {
  const saved = loadUserSettings();
  const [selectedStrategy, setSelectedStrategy] = useState<SelectedBacktestStrategy | null>(null);
  const [validationError, setValidationError] = useState('');
  const scriptParams = extractStrategyParams(selectedStrategy?.source ?? '');

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
    if (!selectedStrategy?.source) {
      setValidationError('Select a strategy to backtest.');
      return;
    }
    setValidationError('');

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
    onRun(config, selectedStrategy, effectiveStartDate, effectiveEndDate);
  }, [selectedStrategy, scriptParams, initialCapital, startDate, endDate, dateRangeMode, daysBack, commissionMethod, commissionMethodSettings, onRun]);

  return (
    <div
      className="backtest-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: 'auto',
        background: tokens.colors.surface['1'],
        border: `1px solid ${tokens.colors.hairline.default}`,
        borderRadius: tokens.radius.md,
        padding: tokens.spacing.xl,
        color: tokens.colors.ink['1'],
        fontSize: tokens.typography.type.bodySm.size,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacing.sm, margin: `0 0 ${tokens.spacing.lg}` }}>
        <button
          onClick={onClose}
          aria-label="Back to dashboard"
          style={{
            background: 'transparent',
            border: `1px solid ${tokens.colors.hairline.default}`,
            borderRadius: tokens.radius.sm,
            color: tokens.colors.ink['2'],
            cursor: 'pointer',
            padding: '4px 8px',
            fontSize: tokens.typography.type.bodySm.size,
          }}
        >
          ← Back
        </button>
        <h3 style={{ margin: 0, color: tokens.colors.brand.blue }}>Backtest Settings</h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.spacing.lg, flex: 1 }}>
        {/* §5.3 Config bar: [Strategy Selector ▾] ... [Run Backtest ▼] */}
        <div style={{ display: 'flex', gap: tokens.spacing.md, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <StrategySelector
              backendUrl={backendUrl}
              value={selectedStrategy?.source ?? ''}
              onChange={(source, name, id) => { setSelectedStrategy({ id, name, source }); setValidationError(''); }}
              label="Strategy"
              height={36}
            />
          </div>
          <button
            onClick={handleRun}
            disabled={!selectedStrategy || barsExceedLimit}
            title={!selectedStrategy ? 'Select a strategy to run the backtest' : undefined}
            style={{
              height: 36,
              padding: `0 ${tokens.spacing.lg}`,
              background: !selectedStrategy || barsExceedLimit ? tokens.colors.surface['2'] : tokens.colors.brand.blue,
              color: !selectedStrategy || barsExceedLimit ? tokens.colors.steel.disabled : tokens.colors.ink.default,
              border: `1px solid ${tokens.colors.hairline.default}`,
              borderRadius: tokens.radius.sm,
              cursor: !selectedStrategy || barsExceedLimit ? 'not-allowed' : 'pointer',
              fontSize: tokens.typography.type.bodySm.size,
              fontWeight: tokens.typography.weights.medium,
              whiteSpace: 'nowrap',
            }}
          >
            Run Backtest
          </button>
        </div>
        {validationError && (
          <div role="alert" style={{ color: tokens.colors.semantic.error, fontSize: tokens.typography.type.caption.size, marginTop: '-8px' }}>
            {validationError}
          </div>
        )}

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
      </div>
    </div>
  );
}

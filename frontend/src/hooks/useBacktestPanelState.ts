import { useEffect, useMemo, useState } from 'react';
import type {
  BacktestConfig,
  CommissionMethodId,
  DateRangeMode,
  SelectedBacktestStrategy,
} from '../types';
import { extractStrategyParams } from '../utils/extractStrategyParams';
import { loadBacktestSettings, saveBacktestSettings } from '../utils/backtestStorage';
import type { BacktestSettings } from '../utils/backtestStorage';

const DEFAULT_INITIAL_CAPITAL = 10000;

const DEFAULT_CONFIG: BacktestConfig = {
  initialCapital: DEFAULT_INITIAL_CAPITAL,
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

/** Contract for the panel's `onRun` — the panel supplies its OWN symbol/timeframe. */
export interface BacktestRunRequest {
  config: BacktestConfig;
  strategy: SelectedBacktestStrategy;
  symbol: string;
  timeframe: string;
  startDate?: string;
  endDate?: string;
}

/** API-facing slice of the run request, without the strategy. */
export interface BacktestRunConfig {
  config: BacktestConfig;
  symbol: string;
  timeframe: string;
  startDate?: string;
  endDate?: string;
}

function buildConfig(scriptParams: Partial<BacktestConfig>, user: BacktestSettings): BacktestConfig {
  return {
    ...DEFAULT_CONFIG,
    ...scriptParams,
    initialCapital: user.initialCapital,
    commission: 0,
    commissionMethod: user.commissionMethod ?? 'jupiter_manual',
    commissionMethodSettings: user.commissionMethodSettings ?? null,
  };
}

/**
 * Owns every bit of BacktestPanel state — strategy, market (symbol/timeframe),
 * date range, commission method — plus persistence and the run payload.
 * Mirrors the `useTelegramSettings` shape: one hook, controlled state, no ceremony.
 */
export function useBacktestPanelState() {
  const [loaded] = useState(loadBacktestSettings);

  // The selected strategy is session-scoped (legacy behavior): not persisted.
  const [selectedStrategy, setSelectedStrategy] = useState<SelectedBacktestStrategy | null>(null);
  const [validationError, setValidationError] = useState('');

  // `extractStrategyParams` seeds the initial capital from the selected strategy's
  // `strategy(initial_capital=...)`, with the persisted value taking precedence.
  const [initialCapital, setInitialCapital] = useState<number>(() => {
    const scriptParams = extractStrategyParams(selectedStrategy?.source ?? '');
    return loaded.initialCapital ?? scriptParams.initialCapital ?? DEFAULT_INITIAL_CAPITAL;
  });

  const [timeframe, setTimeframe] = useState<string>(() => loaded.timeframe);
  const [symbol, setSymbol] = useState<string>(() => loaded.symbol);
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>(() => loaded.dateRangeMode);
  const [daysBack, setDaysBack] = useState<number>(() => loaded.daysBack);
  const [startDate, setStartDate] = useState<string>(() => loaded.startDate);
  const [endDate, setEndDate] = useState<string>(() => loaded.endDate);
  const [commissionMethod, setCommissionMethod] = useState<CommissionMethodId>(
    () => loaded.commissionMethod,
  );
  const [commissionMethodSettings, setCommissionMethodSettings] = useState<
    Record<string, unknown> | null
  >(() => loaded.commissionMethodSettings);

  // Persist on every change (mirrors the old explicit `persist()` calls, and also
  // covers clamp-driven updates from child components).
  useEffect(() => {
    saveBacktestSettings({
      initialCapital,
      timeframe,
      symbol,
      dateRangeMode,
      daysBack,
      startDate,
      endDate,
      commissionMethod,
      commissionMethodSettings,
    });
  }, [
    initialCapital,
    timeframe,
    symbol,
    dateRangeMode,
    daysBack,
    startDate,
    endDate,
    commissionMethod,
    commissionMethodSettings,
  ]);

  /** Resolved run inputs: effective dates (days-back mode → concrete range) + config. */
  const runConfig = useMemo<BacktestRunConfig>(() => {
    const scriptParams = extractStrategyParams(selectedStrategy?.source ?? '');

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
      initialCapital,
      timeframe,
      symbol,
      dateRangeMode,
      daysBack,
      startDate,
      endDate,
      commissionMethod,
      commissionMethodSettings,
    });

    return { config, symbol, timeframe, startDate: effectiveStartDate, endDate: effectiveEndDate };
  }, [
    initialCapital,
    timeframe,
    symbol,
    dateRangeMode,
    daysBack,
    startDate,
    endDate,
    commissionMethod,
    commissionMethodSettings,
    selectedStrategy,
  ]);

  return {
    selectedStrategy,
    setSelectedStrategy,
    validationError,
    setValidationError,
    initialCapital,
    setInitialCapital,
    timeframe,
    setTimeframe,
    symbol,
    setSymbol,
    dateRangeMode,
    setDateRangeMode,
    daysBack,
    setDaysBack,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    commissionMethod,
    setCommissionMethod,
    commissionMethodSettings,
    setCommissionMethodSettings,
    runConfig,
  };
}

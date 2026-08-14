import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  BacktestCommissionMethodSettings,
  CommissionMethodId,
  DateRangeMode,
  ExplicitBacktestOverride,
  SelectedBacktestStrategy,
} from '../types';
import { extractStrategyParams } from '../utils/extractStrategyParams';
import { loadBacktestSettings, saveBacktestSettings } from '../utils/backtestStorage';
import type { BacktestSettings } from '../utils/backtestStorage';

const DEFAULT_INITIAL_CAPITAL = 10000;

/**
 * Official commission-settings keys per method — mirror of the backend
 * contract's OFFICIAL_SETTINGS_KEYS (normalize-explicit-config.ts). UI-state
 * keys like `useCustomRate`/`useCustom` are NOT contract keys and are stripped
 * here before the request leaves the client (the normalizer rejects them).
 */
const OFFICIAL_SETTINGS_KEYS: Record<CommissionMethodId, readonly string[]> = {
  jupiter_ultra: ['pairCategory', 'rate', 'solPriceUsd', 'dexFeeBps'],
  jupiter_manual: ['solPriceUsd', 'dexFeeBps'],
};

/** Contract for the panel's `onRun` — the panel supplies its OWN symbol/timeframe. */
export interface BacktestRunRequest {
  config: ExplicitBacktestOverride;
  strategy: SelectedBacktestStrategy;
  symbol: string;
  timeframe: string;
  startDate?: string;
  endDate?: string;
}

/** API-facing slice of the run request, without the strategy. */
export interface BacktestRunConfig {
  config: ExplicitBacktestOverride;
  symbol: string;
  timeframe: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Reduce the wizard's commission-settings record to the contract's official
 * keys for the chosen method (strips useCustomRate/useCustom and any stale
 * persisted junk). Returns undefined when nothing explicit remains — the
 * engine then resolves fees from the method's official behavior / live fetch.
 * Values are validated server-side by the normalizer; the cast is only a
 * compile-time shape declaration at the wire boundary.
 */
function buildExplicitCommissionSettings(
  method: CommissionMethodId,
  settings: BacktestSettings['commissionMethodSettings'],
): BacktestCommissionMethodSettings | undefined {
  if (!settings || typeof settings !== 'object') return undefined;
  const explicit: Record<string, unknown> = {};
  for (const key of OFFICIAL_SETTINGS_KEYS[method]) {
    const value = settings[key];
    if (value !== undefined) explicit[key] = value;
  }
  if (Object.keys(explicit).length === 0) return undefined;
  return explicit as unknown as BacktestCommissionMethodSettings;
}

/**
 * Build the explicit-override slice of POST /api/backtest from ONLY the
 * settings the user actually sees/touches in the wizard. Absent fields are
 * omitted so the engine resolves them from script-declared defaults — never
 * inject engine defaults here (the legacy commission/commissionType/currency
 * fields are gone from the contract and would 400).
 */
function buildConfig(user: BacktestSettings, commissionSettingsTouched: boolean): ExplicitBacktestOverride {
  const commissionMethod: CommissionMethodId = user.commissionMethod ?? 'jupiter_manual';
  const commissionMethodSettings = commissionSettingsTouched
    ? buildExplicitCommissionSettings(commissionMethod, user.commissionMethodSettings)
    : undefined;
  return {
    commissionMethod,
    initialCapital: user.initialCapital,
    ...(commissionMethodSettings ? { commissionMethodSettings } : {}),
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

  // "User-explicit" gate for fee settings: the stored value is seeded from
  // persisted settings, which may carry legacy injected defaults
  // ({ dexFeeBps: 25, solPriceUsd: 150 }). Fee settings are only sent once the
  // user actually changes the method or edits the settings this session —
  // untouched, they are omitted and the backend fetches live fees.
  const [commissionSettingsTouched, setCommissionSettingsTouched] = useState(false);
  const handleCommissionMethodChange = useCallback((method: CommissionMethodId) => {
    setCommissionSettingsTouched(true);
    setCommissionMethod(method);
  }, []);
  const handleCommissionMethodSettingsChange = useCallback(
    (settings: Record<string, unknown> | null) => {
      setCommissionSettingsTouched(true);
      setCommissionMethodSettings(settings);
    },
    [],
  );

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
    let effectiveStartDate = startDate || undefined;
    let effectiveEndDate = endDate || undefined;

    if (dateRangeMode === 'days_back' && daysBack > 0) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - daysBack);
      effectiveStartDate = start.toISOString().split('T')[0];
      effectiveEndDate = end.toISOString().split('T')[0];
    }

    const config = buildConfig(
      {
        initialCapital,
        timeframe,
        symbol,
        dateRangeMode,
        daysBack,
        startDate,
        endDate,
        commissionMethod,
        commissionMethodSettings,
      },
      commissionSettingsTouched,
    );

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
    commissionSettingsTouched,
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
    setCommissionMethod: handleCommissionMethodChange,
    commissionMethodSettings,
    setCommissionMethodSettings: handleCommissionMethodSettingsChange,
    runConfig,
  };
}

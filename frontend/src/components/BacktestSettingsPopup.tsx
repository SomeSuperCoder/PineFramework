import { useState, useCallback } from 'react';
import { extractStrategyParams } from '../utils/extractStrategyParams';
import type { BacktestConfig, CommissionMethodId } from '../types';

const MAX_BARS = 1500;

const BARS_PER_DAY: Record<string, number> = {
  '1': 1440,
  '5': 288,
  '15': 96,
  '30': 48,
  '60': 24,
  '240': 6,
  'D': 1,
  'W': Math.round(1 / 7 * 100) / 100,
};

function getMaxDays(timeframe: string): number {
  const barsPerDay = BARS_PER_DAY[timeframe] ?? 24;
  return Math.floor(MAX_BARS / barsPerDay);
}

function estimateBars(timeframe: string, days: number): number {
  const barsPerDay = BARS_PER_DAY[timeframe] ?? 24;
  return Math.ceil(barsPerDay * days);
}

const TIMEFRAME_LABELS: Record<string, string> = {
  '1': '1m', '5': '5m', '15': '15m', '30': '30m',
  '60': '1h', '240': '4h', 'D': '1D', 'W': '1W',
};

const COMMISSION_METHODS: Array<{ id: CommissionMethodId; label: string; description: string }> = [
  { id: 'jupiter_ultra', label: 'Jupiter Ultra', description: 'DEX fee + tiered 0–50 bps Jupiter fee + ~$0.0015 network fee' },
  { id: 'jupiter_manual', label: 'Jupiter (Basic Swap)', description: 'DEX fee (default 25 bps) + 0% Jupiter fee + ~$0.0015 network fee — matches live bot' },
  { id: 'percent_fixed', label: 'Percent (Fixed)', description: 'Percentage of trade value' },
  { id: 'per_order_fixed', label: 'Per Order (Fixed)', description: 'Fixed amount per order' },
  { id: 'none', label: 'None', description: 'No commission' },
];

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

function getDefaultMethodSettings(method: CommissionMethodId): Record<string, unknown> | null {
  switch (method) {
    case 'percent_fixed': return { rate: 0.001 };
    case 'per_order_fixed': return { amount: 1 };
    case 'jupiter_ultra': return { dexFeeBps: 25, solPriceUsd: 150 }; // Auto-detect pair tier from symbol
    case 'jupiter_manual': return { dexFeeBps: 25, solPriceUsd: 150 };
    case 'none': return null;
    default: return null;
  }
}

// ── Jupiter Ultra tier auto-detection (simplified, for display only) ──

const JUPITER_TIER_LABELS: Record<string, { label: string; bps: number }> = {
  jupiter_ecosystem: { label: 'Jupiter Ecosystem', bps: 0 },
  pegged_asset: { label: 'Pegged Assets', bps: 0 },
  sol_stable: { label: 'SOL ↔ Stable', bps: 2 },
  lst_stable: { label: 'LST ↔ Stable', bps: 5 },
  default: { label: 'Default', bps: 10 },
  new_token: { label: 'New Token (<24h)', bps: 50 },
};

/** Methods that match the real Jupiter trading bot's fee structure. */
const JUPITER_METHODS = new Set<CommissionMethodId>(['jupiter_manual', 'jupiter_ultra']);

/** Known stablecoin symbols for tier detection. */
const STABLECOINS = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FRAX', 'USD', 'USDE', 'FDUSD']);
const KNOWN_QUOTES = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'FRAX', 'USD', 'DAI', 'BTC', 'ETH', 'SOL', 'BNB', 'XRP'];

/** Detect Jupiter fee tier from a trading pair symbol. Returns tier key + label. */
function detectJupiterTier(symbol: string): { tier: string; label: string; bps: number } {
  // Simple pair parsing: strip separators, match longest known quote suffix
  const clean = symbol.toUpperCase().replace(/[/_\-.]/g, '');
  let base = '', quote = '';
  for (const q of KNOWN_QUOTES) {
    if (clean.endsWith(q) && clean.length > q.length) {
      base = clean.slice(0, clean.length - q.length);
      quote = q;
      break;
    }
  }
  if (!base) return { tier: 'default', label: 'Default', bps: 10 };

  const isStable = (t: string) => STABLECOINS.has(t);
  const isSol = (t: string) => t === 'SOL';
  const isJupEcosystem = (t: string) => t === 'JUP' || t === 'JLP' || t === 'JUPSOL';
  const isLst = (t: string) => t === 'MSOL' || t === 'STSOL' || t === 'BSOL' || t === 'JUPSOL';

  if (isJupEcosystem(base) || isJupEcosystem(quote)) return { tier: 'jupiter_ecosystem', label: 'Jupiter Ecosystem', bps: 0 };
  if ((isStable(base) && isStable(quote)) || (isLst(base) && isLst(quote))) return { tier: 'pegged_asset', label: 'Pegged Assets', bps: 0 };
  if ((isSol(base) && isStable(quote)) || (isStable(base) && isSol(quote))) return { tier: 'sol_stable', label: 'SOL ↔ Stable', bps: 2 };
  if ((isLst(base) && isStable(quote)) || (isStable(base) && isLst(quote))) return { tier: 'lst_stable', label: 'LST ↔ Stable', bps: 5 };

  return { tier: 'default', label: 'Default', bps: 10 };
}

/** Sub-component for Jupiter Basic Swap commission settings (DEX fee + SOL price for network fee). */
function JupiterBasicConfig({
  settings,
  onSettingsChange,
}: {
  settings: Record<string, unknown>;
  onSettingsChange: (s: Record<string, unknown>) => void;
}) {
  const dexFee = (settings as Record<string, unknown>)?.dexFeeBps as number ?? 25;
  const solPrice = (settings as Record<string, unknown>)?.solPriceUsd as number ?? 150;
  return (
    <>
      <div style={{ marginBottom: '8px', padding: '8px 10px', background: '#0a2e1a', border: '1px solid #4caf50', borderRadius: '4px', fontSize: '12px', color: '#4caf50' }}>
        <strong>✓ Realistic fee model</strong><br />
        Jupiter is a liquidity aggregator — it routes through DEXs like Raydium (25 bps) and Orca.<br />
        <strong>Total cost:</strong> DEX swap fee + 0% Jupiter commission + ~$0.0015 network fee
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>
          DEX Swap Fee (bps)
          <span style={{ marginLeft: '4px', color: '#666', cursor: 'help' }} title="Liquidity pool fee charged by the underlying DEX. Raydium=25, Orca=1-30, Meteora=dynamic.">ⓘ</span>
        </label>
        <input
          type="number"
          step="1"
          min="0"
          max="100"
          value={dexFee}
          onChange={(e) => onSettingsChange({ ...settings, dexFeeBps: Number(e.target.value) })}
          style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }}
        />
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#888' }}>
          Fee paid to the DEX liquidity pool. Default 25 bps (Raydium standard). This is <strong>always</strong> paid on every swap through Jupiter.
        </div>
      </div>
      <div style={{ marginTop: '8px' }}>
        <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>
          SOL Price (USD)
          <span style={{ marginLeft: '4px', color: '#666', cursor: 'help' }} title="SOL/USD price for converting Solana network fees from lamports to USD.">ⓘ</span>
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={solPrice}
          onChange={(e) => onSettingsChange({ ...settings, solPriceUsd: Number(e.target.value) })}
          style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }}
        />
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#888' }}>
          SOL/USD price for Solana network fees (~$0.0015 at $150/SOL). 0 disables network fee.
        </div>
      </div>
    </>
  );
}

/** Sub-component for Jupiter Ultra commission settings with auto-detection. */
function JupiterUltraConfig({
  symbol,
  settings,
  onSettingsChange,
}: {
  symbol?: string;
  settings: Record<string, unknown>;
  onSettingsChange: (s: Record<string, unknown>) => void;
}) {
  const useCustom = !!(settings as Record<string, unknown>)?.useCustomRate;
  const tierInfo = symbol ? detectJupiterTier(symbol) : null;

  const handleToggleCustom = (checked: boolean) => {
    const updated = { ...settings };
    if (checked) {
      updated.useCustomRate = true;
      // Keep existing rate or use default
      if (typeof updated.rate !== 'number') updated.rate = 0.001;
    } else {
      delete updated.useCustomRate;
      delete updated.rate;
    }
    onSettingsChange(updated);
  };

  const handleRateChange = (rate: number) => {
    onSettingsChange({ ...settings, useCustom: true, rate });
  };

  return (
    <>
      {tierInfo && !useCustom && (
        <div style={{
          padding: '8px 10px',
          background: '#0a2e1a',
          border: '1px solid #4caf50',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#4caf50',
          marginBottom: '8px',
        }}>
          Auto-detected: <strong>{tierInfo.label} ({tierInfo.bps} bps)</strong> from symbol {symbol}
        </div>
      )}

      {!tierInfo && !useCustom && (
        <div style={{
          padding: '8px 10px',
          background: '#1a1a2e',
          border: '1px solid #333',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#aaa',
          marginBottom: '8px',
        }}>
          Default fee tier: 10 bps. Set a symbol to enable auto-detection.
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginBottom: useCustom ? '8px' : 0 }}>
        <input
          type="checkbox"
          checked={useCustom}
          onChange={(e) => handleToggleCustom(e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
        <span style={{ color: '#aaa', fontSize: '12px' }}>Override with custom rate</span>
      </label>

      {useCustom && (
        <div>
          <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Custom Rate</label>
          <input
            type="number"
            step="0.0001"
            min="0"
            max="1"
            value={(settings as Record<string, unknown>)?.rate as number ?? 0.001}
            onChange={(e) => handleRateChange(Number(e.target.value))}
            style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }}
          />
          <div style={{ marginTop: '4px', fontSize: '11px', color: '#888' }}>
            Custom fee as decimal fraction (e.g. 0.001 = 0.1%)
          </div>
        </div>
      )}

      <div style={{ marginTop: '8px' }}>
        <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>
          DEX Swap Fee (bps)
          <span style={{ marginLeft: '4px', color: '#666', cursor: 'help' }} title="Liquidity pool fee charged by the underlying DEX. Jupiter always routes through a DEX.">ⓘ</span>
        </label>
        <input
          type="number"
          step="1"
          min="0"
          max="100"
          value={(settings as Record<string, unknown>)?.dexFeeBps as number ?? 25}
          onChange={(e) => onSettingsChange({ ...settings, dexFeeBps: Number(e.target.value) })}
          style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }}
        />
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#888' }}>
          Underlying DEX pool fee (Raydium=25, Orca=1-30). Always paid on every swap.
        </div>
      </div>

      <div style={{ marginTop: '8px' }}>
        <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>
          SOL Price (USD)
          <span style={{ marginLeft: '4px', color: '#666', cursor: 'help' }} title="SOL/USD price for converting Solana network fees from lamports to USD.">ⓘ</span>
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={(settings as Record<string, unknown>)?.solPriceUsd as number ?? 150}
          onChange={(e) => onSettingsChange({ ...settings, solPriceUsd: Number(e.target.value) })}
          style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }}
        />
        <div style={{ marginTop: '4px', fontSize: '11px', color: '#888' }}>
          SOL/USD price for Solana network fees (~$0.0015 at $150/SOL). 0 disables network fee.
        </div>
      </div>

      <div style={{ marginTop: '8px', fontSize: '11px', color: '#888' }}>
        <strong>Total = DEX fee + Jupiter Ultra fee + network fee.</strong>{' '}
        See <a href="https://developers.jup.ag/docs/ultra/fees" target="_blank" rel="noopener noreferrer" style={{ color: '#2196f3' }}>Jupiter docs</a>.
      </div>
    </>
  );
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

  const maxDays = getMaxDays(timeframe);
  const estimatedDays = dateRangeMode === 'days_back' ? daysBack : (() => {
    if (startDate && endDate) {
      const diff = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24);
      return Math.max(0, Math.ceil(diff));
    }
    return 0;
  })();
  const estimatedBars = estimateBars(timeframe, estimatedDays);
  const exceedsLimit = estimatedBars > MAX_BARS;

  const persist = useCallback((updates: Partial<UserSettings>) => {
    const current: UserSettings = {
      initialCapital, commission, daysBack, dateRangeMode, startDate, endDate,
      commissionMethod, commissionMethodSettings,
      ...updates,
    };
    saveUserSettings(current);
  }, [initialCapital, commission, daysBack, dateRangeMode, startDate, endDate, commissionMethod, commissionMethodSettings]);

  const handleMethodChange = useCallback((method: CommissionMethodId) => {
    setCommissionMethod(method);
    const settings = getDefaultMethodSettings(method);
    setCommissionMethodSettings(settings);
    persist({ commissionMethod: method, commissionMethodSettings: settings });
  }, [persist]);

  const handleSettingChange = useCallback((key: string, value: unknown) => {
    const updated = { ...(commissionMethodSettings ?? {}), [key]: value };
    setCommissionMethodSettings(updated);
    persist({ commissionMethodSettings: updated });
  }, [commissionMethodSettings, persist]);

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
              <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Commission Method</label>
              <select
                value={commissionMethod ?? ''}
                onChange={(e) => {
                  const val = e.target.value as CommissionMethodId | '';
                  if (val) {
                    handleMethodChange(val);
                  } else {
                    setCommissionMethod(undefined);
                    setCommissionMethodSettings(null);
                    persist({ commissionMethod: undefined, commissionMethodSettings: null });
                  }
                }}
                style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }}
              >
                <option value="">Legacy (from strategy)</option>
                {COMMISSION_METHODS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              {commissionMethod && (
                <div style={{ marginTop: '4px', fontSize: '11px', color: '#888' }}>
                  {COMMISSION_METHODS.find((m) => m.id === commissionMethod)?.description}
                </div>
              )}

              {commissionMethod === undefined ? (
                <div style={{
                  marginTop: '8px',
                  padding: '10px 12px',
                  background: '#3a1a00',
                  border: '1px solid #ff6b00',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#ff8c00',
                  lineHeight: 1.5,
                }}>
                  <strong>⚠️ UNREALISTIC RESULTS</strong><br />
                  No commission method selected — using legacy strategy parameters. The live trading bot executes
                  swaps via <strong>Jupiter</strong> (Router path — 0% Jupiter commission). Select{' '}
                  <strong>Jupiter (Basic Swap)</strong> to match real trading conditions.
                </div>
              ) : !JUPITER_METHODS.has(commissionMethod) ? (
                <div style={{
                  marginTop: '8px',
                  padding: '10px 12px',
                  background: '#3a1a00',
                  border: '1px solid #ff6b00',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#ff8c00',
                  lineHeight: 1.5,
                }}>
                  <strong>⚠️ UNREALISTIC RESULTS</strong><br />
                  The live trading bot executes swaps via <strong>Jupiter</strong> (Router path — 0% Jupiter commission).
                  Using <strong>{COMMISSION_METHODS.find((m) => m.id === commissionMethod)?.label ?? commissionMethod}</strong>{' '}
                  will produce backtest results that do not reflect real trading conditions.
                  Select <strong>Jupiter (Basic Swap)</strong> or <strong>Jupiter Ultra</strong> instead.
                </div>
              ) : (
                <div style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  background: '#0a2e1a',
                  border: '1px solid #4caf50',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: '#4caf50',
                  lineHeight: 1.5,
                }}>
                  ✓ Commission method matches the Jupiter fee structure used by the live trading bot.
                </div>
              )}
            {commissionMethod === 'percent_fixed' && (
              <div>
                <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>
                  Rate (Percent Fixed)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  max="1"
                  value={(commissionMethodSettings as Record<string, unknown>)?.rate as number ?? 0.001}
                  onChange={(e) => handleSettingChange('rate', Number(e.target.value))}
                  style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }}
                />
                <div style={{ marginTop: '4px', fontSize: '11px', color: '#888' }}>
                  Percentage of trade value (e.g. 0.001 = 0.1%)
                </div>
              </div>
            )}

            {commissionMethod === 'jupiter_ultra' && (
              <JupiterUltraConfig
                symbol={symbol}
                settings={commissionMethodSettings as Record<string, unknown> ?? {}}
                onSettingsChange={(newSettings) => {
                  setCommissionMethodSettings(newSettings);
                  persist({ commissionMethodSettings: newSettings });
                }}
              />
            )}
            {commissionMethod === 'jupiter_manual' && (
              <JupiterBasicConfig
                settings={commissionMethodSettings as Record<string, unknown> ?? {}}
                onSettingsChange={(newSettings) => {
                  setCommissionMethodSettings(newSettings);
                  persist({ commissionMethodSettings: newSettings });
                }}
              />
            )}
            {commissionMethod === 'per_order_fixed' && (
              <div>
                <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Fixed Amount per Order</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(commissionMethodSettings as Record<string, unknown>)?.amount as number ?? 1}
                  onChange={(e) => handleSettingChange('amount', Number(e.target.value))}
                  style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }}
                />
                <div style={{ marginTop: '4px', fontSize: '11px', color: '#888' }}>
                  Flat commission amount per order fill
                </div>
              </div>
            )}
            {!commissionMethod && (
              <div>
                <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>Legacy Commission Value</label>
                <input
                  type="number"
                  value={commission}
                  onChange={(e) => { const v = Number(e.target.value); setCommission(v); persist({ commission: v }); }}
                  style={{ width: '100%', padding: '6px', background: '#0f1520', color: '#e0e0e0', border: '1px solid #111128', borderRadius: '4px' }}
                />
                <div style={{ marginTop: '4px', fontSize: '11px', color: '#888' }}>
                  Used with commission_type from strategy() declaration
                </div>
              </div>
            )}
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

          {estimatedDays > 0 && (
            <div style={{
              marginTop: '12px',
              padding: '8px 12px',
              borderRadius: '4px',
              fontSize: '12px',
              background: exceedsLimit ? '#3a1a1a' : '#1a2a1a',
              color: exceedsLimit ? '#e94560' : '#4caf50',
              border: `1px solid ${exceedsLimit ? '#e94560' : '#4caf50'}`,
            }}>
              {exceedsLimit
                ? `~${estimatedBars.toLocaleString()} bars exceeds limit of ${MAX_BARS}. Max for ${TIMEFRAME_LABELS[timeframe] ?? timeframe} is ~${maxDays} day${maxDays !== 1 ? 's' : ''}.`
                : `~${estimatedBars.toLocaleString()} bars (max ${MAX_BARS})`}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
            <button
              onClick={handleRun}
              disabled={exceedsLimit}
              style={{
                padding: '8px 24px',
                background: exceedsLimit ? '#555' : '#2196f3',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: exceedsLimit ? 'not-allowed' : 'pointer',
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

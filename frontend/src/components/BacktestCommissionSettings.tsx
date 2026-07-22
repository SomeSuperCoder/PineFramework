import { useState } from 'react';
import { NumberInput } from './NumberInput.js';
import type { CommissionMethodId } from '../types';
// NumberInput is used by JupiterBasicConfig and JupiterUltraConfig sub-components

const COMMISSION_METHODS: Array<{ id: CommissionMethodId; label: string; description: string }> = [
  {
    id: 'jupiter_ultra',
    label: 'Jupiter Ultra',
    description: 'DEX fee + tiered 0–50 bps Jupiter fee + ~$0.0015 network fee',
  },
  {
    id: 'jupiter_manual',
    label: 'Jupiter (Basic Swap)',
    description:
      'DEX fee (default 25 bps) + 0% Jupiter fee + ~$0.0015 network fee — matches live bot',
  },
];

function getDefaultMethodSettings(method: CommissionMethodId): Record<string, unknown> | null {
  switch (method) {
    case 'jupiter_ultra':
      return { dexFeeBps: 25, solPriceUsd: 150 };
    case 'jupiter_manual':
      return { dexFeeBps: 25, solPriceUsd: 150 };
  }
}

const STABLECOINS = new Set([
  'USDT',
  'USDC',
  'DAI',
  'BUSD',
  'TUSD',
  'FRAX',
  'USD',
  'USDE',
  'FDUSD',
]);
const KNOWN_QUOTES = [
  'USDT',
  'USDC',
  'BUSD',
  'FDUSD',
  'TUSD',
  'FRAX',
  'USD',
  'DAI',
  'BTC',
  'ETH',
  'SOL',
  'BNB',
  'XRP',
];

function detectJupiterTier(symbol: string): { tier: string; label: string; bps: number } {
  const clean = symbol.toUpperCase().replace(/[/_\-.]/g, '');
  let base = '',
    quote = '';
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

  if (isJupEcosystem(base) || isJupEcosystem(quote))
    return { tier: 'jupiter_ecosystem', label: 'Jupiter Ecosystem', bps: 0 };
  if ((isStable(base) && isStable(quote)) || (isLst(base) && isLst(quote)))
    return { tier: 'pegged_asset', label: 'Pegged Assets', bps: 0 };
  if ((isSol(base) && isStable(quote)) || (isStable(base) && isSol(quote)))
    return { tier: 'sol_stable', label: 'SOL ↔ Stable', bps: 2 };
  if ((isLst(base) && isStable(quote)) || (isStable(base) && isLst(quote)))
    return { tier: 'lst_stable', label: 'LST ↔ Stable', bps: 5 };

  return { tier: 'default', label: 'Default', bps: 10 };
}

// ── Jupiter Basic Swap config sub-component ──

function JupiterBasicConfig({
  settings,
  onSettingsChange,
}: {
  settings: Record<string, unknown>;
  onSettingsChange: (s: Record<string, unknown>) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const dexFee = ((settings as Record<string, unknown>)?.dexFeeBps as number) ?? 25;
  const solPrice = ((settings as Record<string, unknown>)?.solPriceUsd as number) ?? 150;
  return (
    <>
      <div
        style={{
          padding: '8px 10px',
          background: '#0a2e1a',
          border: '1px solid #4caf50',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#4caf50',
        }}
      >
        ✓ Realistic fee model — DEX swap fee + 0% Jupiter commission + ~$0.0015 network fee
      </div>

      <div
        onClick={() => setShowAdvanced(!showAdvanced)}
        style={{
          cursor: 'pointer',
          color: '#888',
          fontSize: '12px',
          marginTop: '8px',
          userSelect: 'none',
        }}
      >
        {showAdvanced ? '▼' : '▶'} Advanced settings
        {!showAdvanced && (
          <span style={{ marginLeft: '8px', color: '#666' }}>
            (DEX fee: {dexFee} bps · SOL: ${solPrice})
          </span>
        )}
      </div>

      {showAdvanced && (
        <>
          <div style={{ marginTop: '8px' }}>
            <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>
              DEX Swap Fee (bps)
              <span
                style={{ marginLeft: '4px', color: '#666', cursor: 'help' }}
                title="Liquidity pool fee charged by the underlying DEX. Raydium=25, Orca=1-30, Meteora=dynamic."
              >
                ⓘ
              </span>
            </label>
            <NumberInput
              value={dexFee}
              onChange={(v) => onSettingsChange({ ...settings, dexFeeBps: v })}
              step="1"
              min={0}
              max={100}
            />
            <div style={{ marginTop: '4px', fontSize: '11px', color: '#888' }}>
              Fee paid to the DEX liquidity pool. Default 25 bps (Raydium standard). Auto-fetched
              from Jupiter API before each backtest.
            </div>
          </div>
          <div style={{ marginTop: '8px' }}>
            <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>
              SOL Price (USD)
              <span
                style={{ marginLeft: '4px', color: '#666', cursor: 'help' }}
                title="SOL/USD price for converting Solana network fees from lamports to USD."
              >
                ⓘ
              </span>
            </label>
            <NumberInput
              value={solPrice}
              onChange={(v) => onSettingsChange({ ...settings, solPriceUsd: v })}
              step="0.01"
              min={0}
            />
            <div style={{ marginTop: '4px', fontSize: '11px', color: '#888' }}>
              SOL/USD price for Solana network fees (~$0.0015 at $150/SOL). 0 disables network fee.
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ── Jupiter Ultra config sub-component ──

function JupiterUltraConfig({
  symbol,
  settings,
  onSettingsChange,
}: {
  symbol?: string;
  settings: Record<string, unknown>;
  onSettingsChange: (s: Record<string, unknown>) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const useCustom = !!(settings as Record<string, unknown>)?.useCustomRate;
  const tierInfo = symbol ? detectJupiterTier(symbol) : null;
  const dexFee = ((settings as Record<string, unknown>)?.dexFeeBps as number) ?? 25;
  const solPrice = ((settings as Record<string, unknown>)?.solPriceUsd as number) ?? 150;

  const handleToggleCustom = (checked: boolean) => {
    const updated = { ...settings };
    if (checked) {
      updated.useCustomRate = true;
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
        <div
          style={{
            padding: '8px 10px',
            background: '#0a2e1a',
            border: '1px solid #4caf50',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#4caf50',
            marginBottom: '8px',
          }}
        >
          Auto-detected:{' '}
          <strong>
            {tierInfo.label} ({tierInfo.bps} bps)
          </strong>{' '}
          from symbol {symbol}
        </div>
      )}

      {!tierInfo && !useCustom && (
        <div
          style={{
            padding: '8px 10px',
            background: '#1a1a2e',
            border: '1px solid #333',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#aaa',
            marginBottom: '8px',
          }}
        >
          Default fee tier: 10 bps. Set a symbol to enable auto-detection.
        </div>
      )}

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
          marginBottom: useCustom ? '8px' : 0,
        }}
      >
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
          <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>
            Custom Rate
          </label>
          <NumberInput
            value={((settings as Record<string, unknown>)?.rate as number) ?? 0.001}
            onChange={(v) => handleRateChange(v)}
            step="0.0001"
            min={0}
            max={1}
          />
          <div style={{ marginTop: '4px', fontSize: '11px', color: '#888' }}>
            Custom fee as decimal fraction (e.g. 0.001 = 0.1%)
          </div>
        </div>
      )}

      <div
        onClick={() => setShowAdvanced(!showAdvanced)}
        style={{
          cursor: 'pointer',
          color: '#888',
          fontSize: '12px',
          marginTop: '8px',
          userSelect: 'none',
        }}
      >
        {showAdvanced ? '▼' : '▶'} Advanced settings
        {!showAdvanced && (
          <span style={{ marginLeft: '8px', color: '#666' }}>
            (DEX fee: {dexFee} bps · SOL: ${solPrice})
          </span>
        )}
      </div>

      {showAdvanced && (
        <>
          <div style={{ marginTop: '8px' }}>
            <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>
              DEX Swap Fee (bps)
              <span
                style={{ marginLeft: '4px', color: '#666', cursor: 'help' }}
                title="Liquidity pool fee charged by the underlying DEX. Jupiter always routes through a DEX."
              >
                ⓘ
              </span>
            </label>
            <NumberInput
              value={dexFee}
              onChange={(v) => onSettingsChange({ ...settings, dexFeeBps: v })}
              step="1"
              min={0}
              max={100}
            />
            <div style={{ marginTop: '4px', fontSize: '11px', color: '#888' }}>
              Underlying DEX pool fee (Raydium=25, Orca=1-30). Always paid on every swap.
            </div>
          </div>
          <div style={{ marginTop: '8px' }}>
            <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>
              SOL Price (USD)
              <span
                style={{ marginLeft: '4px', color: '#666', cursor: 'help' }}
                title="SOL/USD price for converting Solana network fees from lamports to USD."
              >
                ⓘ
              </span>
            </label>
            <NumberInput
              value={solPrice}
              onChange={(v) => onSettingsChange({ ...settings, solPriceUsd: v })}
              step="0.01"
              min={0}
            />
            <div style={{ marginTop: '4px', fontSize: '11px', color: '#888' }}>
              SOL/USD price for Solana network fees (~$0.0015 at $150/SOL). 0 disables network fee.
            </div>
          </div>
        </>
      )}

      <div style={{ marginTop: '8px', fontSize: '11px', color: '#888' }}>
        <strong>Total = DEX fee + Jupiter Ultra fee + network fee.</strong> See{' '}
        <a
          href="https://developers.jup.ag/docs/ultra/fees"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#2196f3' }}
        >
          Jupiter docs
        </a>
        .
      </div>
    </>
  );
}

// ── Main exported component ──

export interface BacktestCommissionSettingsProps {
  commissionMethod: CommissionMethodId;
  onCommissionMethodChange: (method: CommissionMethodId) => void;
  commissionMethodSettings: Record<string, unknown> | null;
  onCommissionMethodSettingsChange: (settings: Record<string, unknown> | null) => void;
  symbol?: string;
}

export function BacktestCommissionSettings({
  commissionMethod,
  onCommissionMethodChange,
  commissionMethodSettings,
  onCommissionMethodSettingsChange,
  symbol,
}: BacktestCommissionSettingsProps) {
  const handleMethodChange = (method: CommissionMethodId) => {
    onCommissionMethodChange(method);
    const settings = getDefaultMethodSettings(method);
    onCommissionMethodSettingsChange(settings);
  };

  return (
    <div>
      <label style={{ display: 'block', marginBottom: '4px', color: '#aaa' }}>
        Commission Method
      </label>
      <select
        value={commissionMethod}
        onChange={(e) => handleMethodChange(e.target.value as CommissionMethodId)}
        style={{
          width: '100%',
          padding: '6px',
          background: '#0f1520',
          color: '#e0e0e0',
          border: '1px solid #111128',
          borderRadius: '4px',
        }}
      >
        {COMMISSION_METHODS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      <div style={{ marginTop: '4px', fontSize: '11px', color: '#888' }}>
        {COMMISSION_METHODS.find((m) => m.id === commissionMethod)?.description}
      </div>

      {commissionMethod === 'jupiter_ultra' && (
        <div style={{ marginTop: '8px' }}>
          <JupiterUltraConfig
            symbol={symbol}
            settings={(commissionMethodSettings as Record<string, unknown>) ?? {}}
            onSettingsChange={(newSettings) => onCommissionMethodSettingsChange(newSettings)}
          />
        </div>
      )}

      {commissionMethod === 'jupiter_manual' && (
        <div style={{ marginTop: '8px' }}>
          <JupiterBasicConfig
            settings={(commissionMethodSettings as Record<string, unknown>) ?? {}}
            onSettingsChange={(newSettings) => onCommissionMethodSettingsChange(newSettings)}
          />
        </div>
      )}
    </div>
  );
}

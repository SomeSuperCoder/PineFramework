import { useState } from 'react';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { NumberField } from './BacktestGeneralSettings.js';
import type { CommissionMethodId } from '../types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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

/** Shared footnote inside the advanced panels — muted description text. */
function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-muted-foreground">{children}</p>;
}

/** Helpable numeric labelled row (label + ⓘ + NumberField + hint). */
function FeeField({
  label,
  title,
  value,
  onChange,
  step,
  min,
  max,
  hint,
}: {
  label: string;
  title: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
  min?: number;
  max?: number;
  hint: string;
}) {
  return (
    <div className="mt-2">
      <div title={title}>
        <Label className="text-sm">
          {label}
          <Info
            className="ml-1 inline-block size-3.5 cursor-help text-muted-foreground"
            role="img"
            aria-label="More info"
          />
        </Label>
      </div>
      <NumberField value={value} onChange={onChange} step={step} min={min} max={max} />
      <FieldHint>{hint}</FieldHint>
    </div>
  );
}

/** Advanced-settings disclosure (ghost toggle) — keyed by id so each
 *  sub-config keeps its own open state. */
function AdvancedToggle({
  open,
  onToggle,
  summary,
}: {
  open: boolean;
  onToggle: () => void;
  summary?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-mx-2 mt-2 h-auto px-2 text-xs text-muted-foreground"
      aria-expanded={open}
      onClick={onToggle}
    >
      {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      Advanced settings
      {!open && summary && <span className="ml-2 font-normal text-muted-foreground/80">{summary}</span>}
    </Button>
  );
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
        role="status"
        className="rounded-md border border-[#22c55e] bg-[#22c55e]/10 px-2.5 py-2 text-xs text-[#22c55e]"
      >
        ✓ Realistic fee model — DEX swap fee + 0% Jupiter commission + ~$0.0015 network fee
      </div>

      <AdvancedToggle
        open={showAdvanced}
        onToggle={() => setShowAdvanced(!showAdvanced)}
        summary={`(DEX fee: ${dexFee} bps · SOL: $${solPrice})`}
      />

      {showAdvanced && (
        <>
          <FeeField
            label="DEX Swap Fee (bps)"
            title="Liquidity pool fee charged by the underlying DEX. Raydium=25, Orca=1-30, Meteora=dynamic."
            value={dexFee}
            onChange={(v) => onSettingsChange({ ...settings, dexFeeBps: v })}
            step="1"
            min={0}
            max={100}
            hint="Fee paid to the DEX liquidity pool. Default 25 bps (Raydium standard). Auto-fetched from Jupiter API before each backtest."
          />
          <FeeField
            label="SOL Price (USD)"
            title="SOL/USD price for converting Solana network fees from lamports to USD."
            value={solPrice}
            onChange={(v) => onSettingsChange({ ...settings, solPriceUsd: v })}
            step="0.01"
            min={0}
            hint="SOL/USD price for Solana network fees (~$0.0015 at $150/SOL). 0 disables network fee."
          />
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
          role="status"
          className="mb-2 rounded-md border border-[#22c55e] bg-[#22c55e]/10 px-2.5 py-2 text-xs text-[#22c55e]"
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
          className="mb-2 rounded-md border border-input bg-card px-2.5 py-2 text-xs text-muted-foreground"
        >
          Default fee tier: 10 bps. Set a symbol to enable auto-detection.
        </div>
      )}

      <Label className="mb-2 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        <Switch checked={useCustom} onCheckedChange={handleToggleCustom} aria-label="Override with custom rate" />
        Override with custom rate
      </Label>

      {useCustom && (
        <div>
          <Label>Custom Rate</Label>
          <NumberField
            value={((settings as Record<string, unknown>)?.rate as number) ?? 0.001}
            onChange={(v) => handleRateChange(v)}
            step="0.0001"
            min={0}
            max={1}
          />
          <FieldHint>Custom fee as decimal fraction (e.g. 0.001 = 0.1%)</FieldHint>
        </div>
      )}

      <AdvancedToggle
        open={showAdvanced}
        onToggle={() => setShowAdvanced(!showAdvanced)}
        summary={`(DEX fee: ${dexFee} bps · SOL: $${solPrice})`}
      />

      {showAdvanced && (
        <>
          <FeeField
            label="DEX Swap Fee (bps)"
            title="Liquidity pool fee charged by the underlying DEX. Jupiter always routes through a DEX."
            value={dexFee}
            onChange={(v) => onSettingsChange({ ...settings, dexFeeBps: v })}
            step="1"
            min={0}
            max={100}
            hint="Underlying DEX pool fee (Raydium=25, Orca=1-30). Always paid on every swap."
          />
          <FeeField
            label="SOL Price (USD)"
            title="SOL/USD price for converting Solana network fees from lamports to USD."
            value={solPrice}
            onChange={(v) => onSettingsChange({ ...settings, solPriceUsd: v })}
            step="0.01"
            min={0}
            hint="SOL/USD price for Solana network fees (~$0.0015 at $150/SOL). 0 disables network fee."
          />
        </>
      )}

      <p className="mt-2 text-[11px] text-muted-foreground">
        <strong>Total = DEX fee + Jupiter Ultra fee + network fee.</strong> See{' '}
        <a
          href="https://developers.jup.ag/docs/ultra/fees"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary"
        >
          Jupiter docs
        </a>
        .
      </p>
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
  const handleMethodChange = (method: string) => {
    onCommissionMethodChange(method as CommissionMethodId);
    const settings = getDefaultMethodSettings(method as CommissionMethodId);
    onCommissionMethodSettingsChange(settings);
  };

  return (
    <div>
      <Label>Commission Method</Label>
      <Select value={commissionMethod} onValueChange={handleMethodChange}>
        <SelectTrigger className="mt-1 w-full" title="Commission model used for the backtest">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COMMISSION_METHODS.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {COMMISSION_METHODS.find((m) => m.id === commissionMethod)?.description}
      </p>

      {commissionMethod === 'jupiter_ultra' && (
        <div className="mt-2">
          <JupiterUltraConfig
            symbol={symbol}
            settings={(commissionMethodSettings as Record<string, unknown>) ?? {}}
            onSettingsChange={(newSettings) => onCommissionMethodSettingsChange(newSettings)}
          />
        </div>
      )}

      {commissionMethod === 'jupiter_manual' && (
        <div className="mt-2">
          <JupiterBasicConfig
            settings={(commissionMethodSettings as Record<string, unknown>) ?? {}}
            onSettingsChange={(newSettings) => onCommissionMethodSettingsChange(newSettings)}
          />
        </div>
      )}
    </div>
  );
}
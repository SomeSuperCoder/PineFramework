import { NumberField } from './BacktestGeneralSettings.js';
import { COMMISSION_METHOD_LABELS, type CommissionMethodId } from '../types';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusCallout } from '@/components/ui/status-callout';

const COMMISSION_METHODS: Array<{ id: CommissionMethodId; label: string; description: string }> = [
  {
    id: 'jupiter_ultra',
    label: COMMISSION_METHOD_LABELS.jupiter_ultra,
    description: 'DEX fee + tiered 0–50 bps Jupiter fee + ~$0.0015 network fee',
  },
  {
    id: 'jupiter_manual',
    label: COMMISSION_METHOD_LABELS.jupiter_manual,
    description:
      'DEX fee (default 25 bps) + 0% Jupiter fee + ~$0.0015 network fee — matches live bot',
  },
];

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

/** Shared footnote inside the sub-config panels — muted description text. */
function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-muted-foreground">{children}</p>;
}

// ── Jupiter Basic Swap config sub-component ──

function JupiterBasicConfig() {
  return (
    <>
      <StatusCallout tone="success">
        Realistic fee model — DEX swap fee + 0% Jupiter commission + ~$0.0015 network fee
      </StatusCallout>

      <p className="mt-2 text-xs text-muted-foreground">
        DEX fee and SOL price are auto-fetched from Jupiter for this pair.
      </p>
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
  const useCustom = !!(settings as Record<string, unknown>)?.useCustomRate;
  const tierInfo = symbol ? detectJupiterTier(symbol) : null;

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
        <StatusCallout tone="success" className="mb-2">
          Auto-detected:{' '}
          <strong>
            {tierInfo.label} ({tierInfo.bps} bps)
          </strong>{' '}
          from symbol {symbol}
        </StatusCallout>
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

      <p className="mt-2 text-xs text-muted-foreground">
        DEX fee and SOL price are auto-fetched from Jupiter for this pair.
      </p>

      <p className="mt-2 text-xs text-muted-foreground">
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
    // No fee defaults are injected on method change: explicit settings are only
    // ever the values the user actually edits. Absent settings → the backend
    // fetches live DEX fees / SOL price (explicit fees would bypass that).
    onCommissionMethodSettingsChange(null);
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
      <p className="mt-1 text-xs text-muted-foreground">
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
          <JupiterBasicConfig />
        </div>
      )}
    </div>
  );
}
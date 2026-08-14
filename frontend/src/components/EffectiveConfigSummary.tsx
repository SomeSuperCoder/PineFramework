import { COMMISSION_METHOD_LABELS, type EffectiveBacktestConfig } from '../types';

interface EffectiveConfigSummaryProps {
  /** The engine's post-merge config from the API payload. Absent → render nothing. */
  config?: EffectiveBacktestConfig | null;
}

interface Pair {
  label: string;
  value: string;
}

/** Same formatter the panel's chart uses for timestamps — no date lib. */
function formatDate(ms?: number): string | null {
  if (ms === undefined || ms === null || Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleDateString();
}

/** Resolved run window. Absent start = full history; absent end = latest bar. */
function formatRange(start?: number, end?: number): string | null {
  const s = formatDate(start);
  const e = formatDate(end);
  if (s && e) return `${s} → ${e}`;
  if (s) return `${s} → latest`;
  if (e) return `Full history → ${e}`;
  return 'Full history';
}

function qtyTypeLabel(qtyType?: string): string {
  switch (qtyType) {
    case 'percent_of_equity':
      return '% equity';
    case 'cash':
      return 'cash';
    case 'contracts':
      return 'contracts';
    default:
      return '';
  }
}

function solPriceUsdOf(
  settings: EffectiveBacktestConfig['commissionMethodSettings'],
): number | undefined {
  if (!settings || typeof settings !== 'object') return undefined;
  const value = (settings as Record<string, unknown>).solPriceUsd;
  return typeof value === 'number' ? value : undefined;
}

/**
 * "What actually ran" — a compact echo of the engine's post-merge config.
 * Renders nothing (quietly) when the backend hasn't shipped the field yet.
 */
export function EffectiveConfigSummary({ config }: EffectiveConfigSummaryProps) {
  if (!config) return null;

  const pairs: Pair[] = [];

  const range = formatRange(config.startDate, config.endDate);
  if (range) pairs.push({ label: 'Range', value: range });

  if (config.commissionMethod) {
    pairs.push({
      label: 'Fees',
      value: COMMISSION_METHOD_LABELS[config.commissionMethod] ?? config.commissionMethod,
    });
  }

  if (typeof config.marginLong === 'number' || typeof config.marginShort === 'number') {
    pairs.push({
      label: 'Margin (L/S)',
      value: `${config.marginLong ?? 0} / ${config.marginShort ?? 0}`,
    });
  }

  if (typeof config.pyramiding === 'number') {
    pairs.push({ label: 'Pyramiding', value: String(config.pyramiding) });
  }

  if (typeof config.defaultQty === 'number') {
    const unit = qtyTypeLabel(config.defaultQtyType);
    pairs.push({ label: 'Qty', value: unit ? `${config.defaultQty} ${unit}` : String(config.defaultQty) });
  }

  if (typeof config.initialCapital === 'number') {
    const currency = config.currency && config.currency !== 'USD' ? ` ${config.currency}` : '';
    pairs.push({ label: 'Capital', value: `${config.initialCapital.toLocaleString()}${currency}` });
  }

  const solPriceUsd = solPriceUsdOf(config.commissionMethodSettings);
  if (typeof solPriceUsd === 'number' && solPriceUsd > 0) {
    pairs.push({ label: 'SOL', value: `$${solPriceUsd.toFixed(2)}` });
  }

  if (pairs.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          What actually ran
        </span>
        {pairs.map((pair) => (
          <span key={pair.label} className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground">{pair.label}</span>
            <span className="font-medium tabular-nums">{pair.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

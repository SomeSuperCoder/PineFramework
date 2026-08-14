import { StatusCallout } from '@/components/ui/status-callout';
import type { BacktestWarning, BacktestWarningType } from '../types';

const WARNING_LABELS: Record<BacktestWarningType, string> = {
  'long-only-suppression': 'Long-only suppression',
  'fee-decision': 'Fee decision',
  'baseline-applied': 'Baseline applied',
  'live-fee-cache': 'Live fee cache',
  'live-fee-failure': 'Live fee failure',
  'auto-select-method': 'Method auto-selected',
  'export-failure': 'Export failure',
};

function stringifyContextValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? '?';
  } catch {
    return '?';
  }
}

/** Compact human hint from the structured context — first few key/value pairs. */
function formatContextHint(context: unknown): string | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  const entries = Object.entries(context).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return null;
  const hint = entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${stringifyContextValue(value)}`)
    .join(' · ');
  return hint.length > 140 ? `${hint.slice(0, 137)}…` : hint;
}

interface WarningsStripProps {
  /** Per-run diagnostics. Empty/absent → render nothing (no empty box). */
  warnings?: BacktestWarning[] | null;
}

/**
 * Surfaces the run's warnings via the StatusCallout notice pattern.
 * Any `long-only-suppression` record turns the whole strip amber — suppressed
 * trades materially changed what ran and must not be missed.
 */
export function WarningsStrip({ warnings }: WarningsStripProps) {
  if (!warnings || warnings.length === 0) return null;

  const hasSuppression = warnings.some((warning) => warning.type === 'long-only-suppression');
  const tone = hasSuppression ? 'warning' : 'info';

  return (
    <StatusCallout tone={tone} className="w-full">
      <div className="flex flex-col gap-1.5">
        {warnings.map((warning, index) => {
          const hint = formatContextHint(warning.context);
          return (
            <div key={`${warning.type}-${index}`} className="flex items-start gap-2">
              <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap">
                {WARNING_LABELS[warning.type] ?? warning.type}
              </span>
              <span className="min-w-0 break-words">{warning.message}</span>
              {hint && <span className="ml-auto text-muted-foreground/70 shrink-0">{hint}</span>}
            </div>
          );
        })}
      </div>
    </StatusCallout>
  );
}

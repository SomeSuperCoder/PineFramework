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

/**
 * Compact human hint from the structured context — EVERY key/value pair.
 * No key truncation: the fee-decision `effectiveSettings` is the 4th key and
 * must be visible. Long hints wrap in the strip's detail line; the length cap
 * is defensive only (it truncates an abnormally large value, never a key).
 */
function formatContextHint(context: unknown): string | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  const entries = Object.entries(context).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return null;
  const hint = entries.map(([key, value]) => `${key}: ${stringifyContextValue(value)}`).join(' · ');
  return hint.length > 400 ? `${hint.slice(0, 397)}…` : hint;
}

/** One render row after aggregation. */
interface WarningRow {
  type: BacktestWarningType;
  message: string;
  /** 1 for a unique row; N when exact duplicates were collapsed into it. */
  count: number;
  context?: unknown;
  /** Pre-formatted per-setting detail for the aggregated baseline row. */
  detail?: string;
}

/** One baseline diagnostic's "setting: baseline" entry, or null when malformed. */
function baselineEntry(context: unknown): string | null {
  if (!context || typeof context !== 'object' || Array.isArray(context)) return null;
  const { setting, baseline } = context as Record<string, unknown>;
  if (setting === undefined || baseline === undefined) return null;
  return `${String(setting)}: ${stringifyContextValue(baseline)}`;
}

/**
 * Render-side aggregation — pure display, the API payload is never modified.
 * Mirrors the CLI's type|message keying: exact duplicates collapse into one
 * row with a ×N count, and baseline-applied diagnostics collapse into a single
 * summary row listing each setting + baseline.
 */
function aggregateWarnings(warnings: BacktestWarning[]): WarningRow[] {
  const rows: WarningRow[] = [];
  const seen = new Set<string>();
  let baselinePlaced = false;

  const baselineWarnings = warnings.filter((warning) => warning.type === 'baseline-applied');

  // Count exact duplicates (type|message) so a collapsed row can carry ×N.
  // Baseline diagnostics are excluded — they collapse into the single summary
  // row below, which intentionally keeps count 1.
  const counts = new Map<string, number>();
  for (const warning of warnings) {
    if (warning.type === 'baseline-applied') continue;
    const key = `${warning.type}|${warning.message}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  for (const warning of warnings) {
    if (warning.type === 'baseline-applied') {
      if (baselinePlaced) continue;
      baselinePlaced = true;
      const entries = baselineWarnings
        .map((w) => baselineEntry(w.context))
        .filter((entry): entry is string => entry !== null);
      rows.push({
        type: 'baseline-applied',
        message: `strategy() did not declare ${baselineWarnings.length} setting${
          baselineWarnings.length === 1 ? '' : 's'
        } — engine defaults applied`,
        count: 1,
        detail: entries.length > 0 ? entries.join(' · ') : undefined,
      });
      continue;
    }
    const key = `${warning.type}|${warning.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      type: warning.type,
      message: warning.message,
      count: counts.get(key) ?? 1,
      context: warning.context,
    });
  }
  return rows;
}

interface WarningsStripProps {
  /** Per-run diagnostics. Empty/absent → render nothing (no empty box). */
  warnings?: BacktestWarning[] | null;
}

/**
 * Surfaces the run's warnings via the StatusCallout notice pattern.
 * Any `long-only-suppression` record turns the whole strip amber — suppressed
 * trades materially changed what ran and must not be missed.
 *
 * Rendering only: exact-duplicate warnings are collapsed with a ×N count and
 * baseline-applied diagnostics are grouped into one summary row, so the strip
 * surfaces the meaningful signals (suppression, fee decisions) instead of
 * being buried under repetitive rows.
 */
export function WarningsStrip({ warnings }: WarningsStripProps) {
  if (!warnings || warnings.length === 0) return null;

  const rows = aggregateWarnings(warnings);
  const hasSuppression = rows.some((row) => row.type === 'long-only-suppression');
  const tone = hasSuppression ? 'warning' : 'info';

  return (
    <StatusCallout tone={tone} className="w-full">
      <div className="flex flex-col gap-1.5">
        {rows.map((row, index) => {
          const hint = formatContextHint(row.context);
          return (
            <div key={`${row.type}-${index}`} className="flex flex-col gap-0.5">
              <div className="flex items-start gap-2">
                <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap">
                  {WARNING_LABELS[row.type] ?? row.type}
                </span>
                <span className="min-w-0 flex-1 break-words">{row.message}</span>
                {row.count > 1 && (
                  <span className="ml-auto shrink-0 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap tabular-nums">
                    ×{row.count}
                  </span>
                )}
              </div>
              {hint && (
                <div className="pl-1 text-xs leading-relaxed text-muted-foreground/70 break-words">
                  {hint}
                </div>
              )}
              {row.detail && (
                <div className="pl-1 text-xs leading-relaxed text-muted-foreground/70 break-words">
                  {row.detail}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </StatusCallout>
  );
}

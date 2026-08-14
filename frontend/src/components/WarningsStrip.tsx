import { StatusCallout } from '@/components/ui/status-callout';
import { cn } from '@/lib/utils';
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

/**
 * Render-order priority — lower number renders first. Only
 * `long-only-suppression` is promoted (to the very top of the strip); every
 * other row falls back to rank 1, so the stable sort keeps the remaining
 * warnings in their current relative (payload) order.
 */
const WARNING_ROW_PRIORITY: Partial<Record<BacktestWarningType, number>> = {
  'long-only-suppression': 0,
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
  /** Severity carried from the source warnings — 'info' rows render as quiet
   *  confirmations. Absent = 'warning'. */
  level?: 'info' | 'warning';
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
  // A collapsed row is 'info' only when EVERY contributing warning is 'info'
  // (absent level means 'warning') — a single true warning keeps the alarm row.
  const infoOnly = new Map<string, boolean>();
  for (const warning of warnings) {
    if (warning.type === 'baseline-applied') continue;
    const key = `${warning.type}|${warning.message}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (warning.level !== 'info') infoOnly.set(key, false);
    else if (!infoOnly.has(key)) infoOnly.set(key, true);
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
      level: infoOnly.get(key) ? 'info' : undefined,
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
 * Rendering only: `info`-level diagnostics (e.g. a user-explicit fee decision)
 * are dropped BEFORE aggregation — they confirm explicit user choices and are
 * API/CLI material, not UI warnings, so the strip shows only real warnings
 * (level absent or 'warning'). The remaining warnings are collapsed by exact
 * duplicate with a ×N count and baseline-applied diagnostics are grouped into
 * one summary row, so the strip surfaces the meaningful signals (suppression,
 * fee decisions) instead of being buried under repetitive rows. The
 * long-only-suppression row renders first when present; remaining rows keep
 * their payload-relative order.
 */
export function WarningsStrip({ warnings }: WarningsStripProps) {
  const warningRows = (warnings ?? []).filter((warning) => warning.level !== 'info');
  if (warningRows.length === 0) return null;

  const rows = aggregateWarnings(warningRows).sort(
    (a, b) => (WARNING_ROW_PRIORITY[a.type] ?? 1) - (WARNING_ROW_PRIORITY[b.type] ?? 1),
  );
  const hasSuppression = rows.some((row) => row.type === 'long-only-suppression');
  const tone = hasSuppression ? 'warning' : 'info';

  return (
    <StatusCallout tone={tone} className="w-full">
      <div className="flex flex-col gap-1.5">
        {rows.map((row, index) => {
          const hint = formatContextHint(row.context);
          const isInfo = row.level === 'info';
          // Quiet informational rows: subdued badge + message, no alarm tone —
          // the content (type label, message, context) stays fully visible.
          const badgeClass = isInfo
            ? 'rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-muted-foreground'
            : 'rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap';
          return (
            <div key={`${row.type}-${index}`} className="flex flex-col gap-0.5">
              <div className="flex items-start gap-2">
                {isInfo && (
                  <span
                    aria-hidden="true"
                    className="mt-px text-[10px] leading-4 text-muted-foreground/70"
                  >
                    ℹ
                  </span>
                )}
                <span className={badgeClass}>{WARNING_LABELS[row.type] ?? row.type}</span>
                <span
                  className={
                    isInfo
                      ? 'min-w-0 flex-1 break-words text-muted-foreground'
                      : 'min-w-0 flex-1 break-words'
                  }
                >
                  {row.message}
                </span>
                {row.count > 1 && (
                  <span className={cn(badgeClass, 'ml-auto shrink-0 tabular-nums')}>
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

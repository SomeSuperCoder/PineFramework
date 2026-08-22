import { forwardRef, useEffect, useRef, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

// ---- Auto-Select Progress Grid ----
// Reworked for F4: subcomponent extraction (CandidateRow / ConcurrencyBadge /
// ScrollableGrid) so existing callers (BotMetrics, BotControls) keep working
// unchanged, plus a bounded-concurrency badge and auto-scroll to the active
// symbol. Backward-compatible: legacy callers pass only `statuses`/`ranking`
// and get the old behavior; the wizard passes the new optional props.

export type CandidateStatus = {
  phase: string;
  status: 'pending' | 'active' | 'done' | 'failed';
  error?: string;
  // V2 enrichments (optional — absent for legacy callers)
  label?: string;
  symbol?: string;
  timeframe?: string;
  slot?: number;
  pnlPercent?: number;
  profitFactor?: number;
  sharpeRatio?: number;
};

/** Status glyph for the auto-select ranking list. Kept for legacy consumers. */
export function StatusIcon({ status }: { status: CandidateStatus['status'] }) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="ghost" className="text-[11px] font-normal text-[var(--color-muted-foreground)]">
          {'\u2014'}
        </Badge>
      );
    case 'active':
      return (
        <Badge variant="outline" className="gap-1 text-[11px] font-normal">
          <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <span className="sr-only">active</span>
        </Badge>
      );
    case 'done':
      return (
        <Badge variant="secondary" className="text-[11px] font-normal text-[#22c55e]">
          {'\u2713'}
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="destructive" className="text-[11px] font-normal">
          {'\u2717'}
        </Badge>
      );
  }
}

/** Bounded-concurrency visibility chip: "k / N active". */
export function ConcurrencyBadge({ active, concurrency }: { active: number; concurrency: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-[var(--color-primary)]/40 bg-[rgba(var(--color-primary),0.12)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-primary)]"
      title="Concurrent backtests running"
    >
      <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      {active} / {concurrency} active
    </span>
  );
}

const formatTimeframe = (tf: string) => {
  if (tf === '5') return '5m';
  if (tf === '15') return '15m';
  if (tf === '60') return '1h';
  if (tf === '240') return '4h';
  return tf;
};

const formatPairLabel = (label: string) => {
  // Accept "SYM (TF)" or "SYM · TF · STG"
  const paren = label.match(/^(.+?)\s*\((.+?)\)$/);
  if (paren) return `${paren[1]} · ${formatTimeframe(paren[2])}`;
  return label;
};

export interface CandidateRowProps {
  worldKey: string;
  label: string; // already formatted for display
  phase: string;
  status: CandidateStatus['status'];
  slot?: number;
  error?: string;
  pnlPercent?: number;
  showCandleProgress?: boolean;
  candleFetched?: number;
  candleTotal?: number;
  isActive?: boolean;
  strategyName?: string;
  registerRef?: (key: string, el: HTMLDivElement | null) => void;
}

/** One candidate world's row. */
export function CandidateRow({
  worldKey,
  label,
  phase,
  status,
  slot,
  error,
  pnlPercent,
  showCandleProgress,
  candleFetched,
  candleTotal,
  isActive,
  strategyName,
  registerRef,
}: CandidateRowProps) {
  const displayPhase = status === 'done' ? 'done' : phase;
  const pnlPositive = pnlPercent != null && pnlPercent >= 0;
  return (
    <div
      ref={(el) => registerRef?.(worldKey, el)}
      className="contents"
      data-active={isActive ? 'true' : undefined}
    >
      <div className="truncate text-[11px] text-[var(--color-foreground)]">
        {label}
        {slot != null && isActive && (
          <span className="ml-1 text-[9px] text-[var(--color-primary)]">·slot {slot}</span>
        )}
      </div>
      <div className="truncate text-[11px] text-[var(--color-muted-foreground)]" title={strategyName ?? ''}>
        {strategyName || '—'}
      </div>
      <div className="text-[11px] text-[var(--color-muted-foreground)]">{displayPhase}</div>
      <div title={error}>
        <StatusIcon status={status} />
      </div>
      <div
        className="text-[11px] tabular-nums"
        style={{
          color: pnlPercent != null
            ? pnlPositive
              ? '#22c55e'
              : 'var(--color-destructive)'
            : 'var(--color-muted-foreground)',
        }}
      >
        {pnlPercent != null ? `${pnlPositive ? '+' : ''}${pnlPercent.toFixed(2)}%` : ''}
      </div>
      {error && status === 'failed' && (
        <div className="col-span-4 mt-0.5 text-[9px] opacity-80 text-[var(--color-destructive)]">
          {error.length > 80 ? `${error.slice(0, 80)}...` : error}
        </div>
      )}
      {showCandleProgress && candleTotal != null && (
        <div className="col-span-4 mt-1">
          <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-secondary)]">
            <div
              className="h-full rounded-full bg-[var(--color-primary)]"
              style={{
                width: `${(candleFetched! / Math.max(candleTotal, 1)) * 100}%`,
                transition: `width 200ms cubic-bezier(0.25, 0.1, 0.25, 1)`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export interface ScrollableGridProps {
  children: React.ReactNode;
}

/**
 * The `max-h-[200px] overflow-auto` container. The scroll ref is forwarded so
 * the composer (`AutoSelectGrid`) can drive auto-scroll. We scroll via
 * `scrollTop` on this container only — never `scrollIntoView` (which scrolls
 * every scrollable ancestor and breaks the dashboard layout). Reuses the
 * LiveDashboard.tsx:328-333 log pattern.
 */
export const ScrollableGrid = forwardRef<HTMLDivElement, ScrollableGridProps>(
  ({ children }, ref) => (
    <div
      ref={ref}
      className="mt-2 max-h-[200px] overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-card)]/40 p-2"
      aria-live="polite"
    >
      {children}
    </div>
  ),
);
ScrollableGrid.displayName = 'ScrollableGrid';

export function AutoSelectGrid({
  statuses,
  ranking,
  candleProgress,
  currentPair,
  // F4 new optional props
  concurrency,
  activeWorlds,
  // Strategy tag for the dedicated Strategy column (auto-select tests one
  // strategy, so the same value applies to every row).
  strategyName,
}: {
  statuses: Record<string, CandidateStatus>;
  ranking?: Array<{
    label: string;
    metrics: Record<string, number>;
    strategyName?: string;
    symbol?: string;
    timeframe?: string;
  }>;
  candleProgress?: { fetched: number; total: number };
  currentPair?: string;
  /** Bounded concurrency — when present, shows the badge. */
  concurrency?: number;
  /** World keys currently active. Enables auto-scroll to the active symbol. */
  activeWorlds?: string[];
  /** Strategy name shown in the dedicated Strategy column (falls back to —). */
  strategyName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const registerRef = useCallback((key: string, el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(key, el);
    else rowRefs.current.delete(key);
  }, []);

  const entries = Object.entries(statuses);
  const activeCount = entries.filter(([, st]) => st.status === 'active').length;

  // Auto-scroll: jump to the first active world within THIS container only.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (activeWorlds && activeWorlds.length > 0) {
      const firstActive = activeWorlds.find((k) => rowRefs.current.has(k));
      const el = firstActive ? rowRefs.current.get(firstActive) : undefined;
      if (el) {
        const target = el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2;
        container.scrollTop = Math.max(0, target);
        return;
      }
    }
    // Legacy fallback: no activeWorlds but a run is in progress → stick to bottom.
    if (!activeWorlds && activeCount > 0) {
      container.scrollTop = container.scrollHeight;
    }
  }, [activeWorlds, activeCount, statuses]);

  // Legacy candle-progress target: currentPair (single-pair backends).
  const candleTargetKey =
    (candleProgress && (candleProgress as any).worldKey) || currentPair;

  return (
    <div>
      {concurrency != null && (
        <div className="mb-1.5 flex justify-end">
          <ConcurrencyBadge active={activeCount} concurrency={concurrency} />
        </div>
      )}
      <ScrollableGrid ref={containerRef}>
        <div
          className="grid items-center gap-x-2 gap-y-0.5 text-[10px]"
          style={{ gridTemplateColumns: '1fr 120px 80px 60px 60px' }}
        >
          <div className="font-semibold text-[var(--color-muted-foreground)]">Pair</div>
          <div className="font-semibold text-[var(--color-muted-foreground)]">Strategy</div>
          <div className="font-semibold text-[var(--color-muted-foreground)]">Phase</div>
          <div className="font-semibold text-[var(--color-muted-foreground)]">Status</div>
          <div className="font-semibold text-[var(--color-muted-foreground)]">PnL</div>
          {entries.map(([key, st]) => {
            const rankEntry = ranking?.find(
              (r) => r.label === key || (r.symbol && `${r.symbol} (${r.timeframe})` === key),
            );
            const pnl =
              rankEntry?.metrics.totalPnlPercent ?? rankEntry?.metrics.pnlPercent;
            const baseLabel = st.label ? formatPairLabel(st.label) : formatPairLabel(key);
            const showCandle =
              candleTargetKey === key && st.status === 'active' && st.phase === 'fetching' && !!candleProgress;
            return (
              <CandidateRow
                key={key}
                worldKey={key}
                label={baseLabel}
                phase={st.phase}
                status={st.status}
                slot={st.slot}
                error={st.error}
                pnlPercent={pnl != null ? pnl : st.pnlPercent}
                isActive={st.status === 'active'}
                strategyName={strategyName ?? rankEntry?.strategyName}
                showCandleProgress={showCandle}
                candleFetched={candleProgress?.fetched}
                candleTotal={candleProgress?.total}
                registerRef={registerRef}
              />
            );
          })}
        </div>
      </ScrollableGrid>
    </div>
  );
}

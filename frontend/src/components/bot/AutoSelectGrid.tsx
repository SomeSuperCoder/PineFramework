import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

// ---- Auto-Select Progress Grid ----

export type CandidateStatus = {
  phase: string;
  status: 'pending' | 'active' | 'done' | 'failed';
  error?: string;
};

/** Status glyph for the auto-select ranking list. */
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

const formatTimeframe = (tf: string) => {
  if (tf === '5') return '5m';
  if (tf === '15') return '15m';
  if (tf === '60') return '1h';
  if (tf === '240') return '4h';
  return tf;
};

const formatPairLabel = (label: string) => {
  const match = label.match(/^(.+?)\s*\((.+?)\)$/);
  if (match) {
    return `${match[1]} · ${formatTimeframe(match[2])}`;
  }
  return label;
};

export function AutoSelectGrid({
  statuses,
  ranking,
  candleProgress,
  currentPair,
}: {
  statuses: Record<string, CandidateStatus>;
  ranking?: Array<{ label: string; metrics: Record<string, number> }>;
  candleProgress?: { fetched: number; total: number };
  currentPair?: string;
}) {
  const entries = Object.entries(statuses);

  return (
    <div className="mt-2 max-h-[200px] overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-card)]/40 p-2">
      <div
        className="grid items-center gap-x-2 gap-y-0.5 text-[10px]"
        style={{ gridTemplateColumns: '1fr 80px 60px 60px' }}
      >
        <div className="font-semibold text-[var(--color-muted-foreground)]">Pair</div>
        <div className="font-semibold text-[var(--color-muted-foreground)]">Phase</div>
        <div className="font-semibold text-[var(--color-muted-foreground)]">Status</div>
        <div className="font-semibold text-[var(--color-muted-foreground)]">PnL</div>
        {entries.map(([key, st]) => {
          const rankEntry = ranking?.find(r => r.label === key);
          const isCurrentPair = currentPair === key && st.status === 'active';
          const showCandleProgress = isCurrentPair && st.phase === 'fetching' && candleProgress;
          const displayPhase = st.status === 'done' ? 'done' : st.phase;

          return (
            <div key={key} className="contents">
              <div className="truncate text-[11px] text-[var(--color-foreground)]">{formatPairLabel(key)}</div>
              <div className="text-[11px] text-[var(--color-muted-foreground)]">
                {showCandleProgress
                  ? `${candleProgress.fetched}/${candleProgress.total}`
                  : displayPhase}
              </div>
              <div title={st.error}>
                <StatusIcon status={st.status} />
              </div>
              <div
                className="text-[11px] tabular-nums"
                style={{
                  color:
                    rankEntry?.metrics.totalPnlPercent != null && rankEntry.metrics.totalPnlPercent >= 0
                      ? '#22c55e'
                      : 'var(--color-destructive)',
                }}
              >
                {rankEntry?.metrics.totalPnlPercent != null
                  ? `${rankEntry.metrics.totalPnlPercent >= 0 ? '+' : ''}${rankEntry.metrics.totalPnlPercent.toFixed(2)}%`
                  : ''}
              </div>
              {st.error && st.status === 'failed' && (
                <div
                  className="col-span-4 mt-0.5 text-[9px] opacity-80 text-[var(--color-destructive)]"
                >
                  {st.error.length > 80 ? `${st.error.slice(0, 80)}...` : st.error}
                </div>
              )}
              {showCandleProgress && (
                <div className="col-span-4 mt-1">
                  <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-secondary)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-primary)]"
                      style={{
                        width: `${(candleProgress.fetched / Math.max(candleProgress.total, 1)) * 100}%`,
                        transition: `width 200ms cubic-bezier(0.25, 0.1, 0.25, 1)`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

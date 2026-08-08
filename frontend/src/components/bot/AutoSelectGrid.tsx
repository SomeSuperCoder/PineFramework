import React from 'react';
import { tokens } from '../../theme/tokens';

// ---- Auto-Select Progress Grid ----

export type CandidateStatus = { phase: string; status: 'pending' | 'active' | 'done' | 'failed'; error?: string };

export function StatusIcon({ status }: { status: CandidateStatus['status'] }) {
  switch (status) {
    case 'pending':
      return <span style={{ color: tokens.colors.steel.disabled, fontSize: 11 }}>—</span>;
    case 'active':
      return <span style={{ color: tokens.colors.semantic.warning, fontSize: 11, animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>;
    case 'done':
      return <span style={{ color: tokens.colors.semantic.success, fontSize: 11 }}>✓</span>;
    case 'failed':
      return <span style={{ color: tokens.colors.semantic.error, fontSize: 11 }}>✗</span>;
  }
}

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

  return (
    <div style={{
      marginTop: 8, padding: 8, background: tokens.colors.hairline.default, borderRadius: 6,
      border: '1px solid #333', maxHeight: 200, overflow: 'auto',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 80px 60px 60px',
        gap: '2px 8px',
        fontSize: 10,
      }}>
        <div style={{ color: '#666', fontWeight: 600 }}>Pair</div>
        <div style={{ color: '#666', fontWeight: 600 }}>Phase</div>
        <div style={{ color: '#666', fontWeight: 600 }}>Status</div>
        <div style={{ color: '#666', fontWeight: 600 }}>PnL</div>
        {entries.map(([key, st]) => {
          const rankEntry = ranking?.find(r => r.label === key);
          const isCurrentPair = currentPair === key && st.status === 'active';
          const showCandleProgress = isCurrentPair && st.phase === 'fetching' && candleProgress;
          const displayPhase = st.status === 'done' ? 'done' : st.phase;

          return (
            <React.Fragment key={key}>
              <div style={{ color: tokens.colors.ink['1'] }}>{formatPairLabel(key)}</div>
              <div style={{ color: tokens.colors.steel.muted }}>
                {showCandleProgress
                  ? `${candleProgress.fetched}/${candleProgress.total}`
                  : displayPhase}
              </div>
              <div title={st.error}>
                <StatusIcon status={st.status} />
              </div>
              <div style={{ color: rankEntry?.metrics.totalPnlPercent != null && rankEntry.metrics.totalPnlPercent >= 0 ? tokens.colors.semantic.success : tokens.colors.semantic.error }}>
                {rankEntry?.metrics.totalPnlPercent != null ? `${rankEntry.metrics.totalPnlPercent >= 0 ? '+' : ''}${rankEntry.metrics.totalPnlPercent.toFixed(2)}%` : ''}
              </div>
              {st.error && st.status === 'failed' && (
                <div style={{ gridColumn: '1 / -1', color: tokens.colors.semantic.error, fontSize: 9, marginTop: 1, opacity: 0.8 }}>
                  {st.error.length > 80 ? st.error.slice(0, 80) + '...' : st.error}
                </div>
              )}
              {showCandleProgress && (
                <div style={{ gridColumn: '1 / -1', marginTop: 2 }}>
                  <div style={{
                    width: '100%', height: 4, background: '#222', borderRadius: 2, overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${(candleProgress.fetched / Math.max(candleProgress.total, 1)) * 100}%`,
                      height: '100%', background: tokens.colors.semantic.info, borderRadius: 2,
                      transition: 'width 0.2s ease',
                    }} />
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

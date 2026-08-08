import type { BotStatusSnapshot, WalletInfo } from '../../types/bot';
import type { ChaosHeartbeatRecord, CandleErrorRecord, FeedStatus } from '../../types';
import { MetricValue } from './MetricValue';
import { DASH, fmtDur, fmtPnl } from '../../utils/format';

// ---- Chaos observability helpers ----

/** Short human-readable label for the last chaos candle outcome. */
function formatChaosHeartbeat(h: ChaosHeartbeatRecord | null | undefined): string {
  if (!h) return '\u2014';
  switch (h.outcome) {
    case 'signal':
      return `signal${h.action ? ` (${h.action})` : ''}`;
    case 'noop':
      return `no-op${h.reason ? ` (${h.reason})` : ''}`;
    case 'error':
      return `error${h.reason ? `: ${h.reason.length > 48 ? `${h.reason.slice(0, 48)}…` : h.reason}` : ''}`;
  }
}

function chaosHeartbeatColor(h: ChaosHeartbeatRecord | null | undefined): string | undefined {
  if (!h) return undefined;
  if (h.outcome === 'signal') return '#4caf50';
  if (h.outcome === 'noop') return '#ff9800';
  return '#e94560';
}

/** Human-readable feed status for the dashboard: connected / disconnected /
 *  connected-but-silent, with last-candle + candle-count detail in the title. */
function formatFeedStatus(feed: FeedStatus | null | undefined): { text: string; color?: string; title?: string } {
  if (!feed) return { text: '\u2014' };
  const parts: string[] = [];
  if (feed.lastCandleAt != null) {
    parts.push(`last candle ${new Date(feed.lastCandleAt).toLocaleTimeString()}`);
  }
  parts.push(`${feed.candleCount} candles`);
  if (feed.silentSince != null) {
    parts.push(`silent since ${new Date(feed.silentSince).toLocaleTimeString()}`);
  }
  if (!feed.connected) {
    return { text: 'Disconnected', color: '#e94560', title: parts.join(' · ') };
  }
  if (feed.silentSince != null) {
    return { text: 'Connected · silent', color: '#ff9800', title: parts.join(' · ') };
  }
  return { text: 'Connected', color: '#4caf50', title: parts.join(' · ') };
}

// ---- Left: Status Panel ----

export function BotStatusPanel({
  status,
  stateColor,
  now,
  wallet,
  chaosMode,
  chaosHeartbeat,
  totalCandleErrors,
  lastCandleError,
  feedStatus,
}: {
  status: BotStatusSnapshot;
  stateColor: string;
  now: number;
  wallet: WalletInfo;
  chaosMode?: boolean;
  chaosHeartbeat?: ChaosHeartbeatRecord | null;
  totalCandleErrors: number;
  lastCandleError?: CandleErrorRecord | null;
  feedStatus?: FeedStatus | null;
}) {
  // Feed connectivity — live `bot:feedStatus` state wins over the
  // snapshot-carried `status.feedState`.
  const feedDisplay = formatFeedStatus(feedStatus ?? status.feedState);

  return (
    <div style={{ borderRight: '1px solid #1a1a2e', padding: 12, overflow: 'auto' }}>
      <div style={{ color: '#888', fontWeight: 600, marginBottom: 8, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Status</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <MetricValue label="State" value={status.state} color={stateColor} />
        {wallet.publicKey && (
          <MetricValue
            label="Wallet"
            value={`${wallet.publicKey.slice(0, 8)}...${wallet.publicKey.slice(-4)}`}
            color="#4caf50"
          />
        )}
        <MetricValue label="Strategy" value={status.strategyName} />
        <MetricValue label="DEX" value={status.dex} />
        <MetricValue label="Duration" value={status.startedAt != null ? fmtDur(now - status.startedAt) : DASH} />
        <MetricValue label="Balance" value={`$${status.balance.toFixed(2)}`} />
        <MetricValue label="Realized PnL" value={fmtPnl(status.realizedPnl).text} color={fmtPnl(status.realizedPnl).color} />
        <MetricValue label="Unrealized PnL" value={fmtPnl(status.unrealizedPnl).text} color={fmtPnl(status.unrealizedPnl).color} />
        <MetricValue label="Exposure" value={`${(status.exposure * 100).toFixed(1)}%`} />

        {chaosMode && (
          <MetricValue
            label="Chaos Last Candle"
            value={formatChaosHeartbeat(chaosHeartbeat)}
            color={chaosHeartbeatColor(chaosHeartbeat)}
          />
        )}
        <MetricValue
          label="Candle Errors"
          value={String(totalCandleErrors)}
          color={totalCandleErrors > 0 ? '#e94560' : undefined}
          title={lastCandleError
            ? `${lastCandleError.pair} ${lastCandleError.timeframe}: ${lastCandleError.message}`
            : undefined}
        />
        <MetricValue
          label="Feed"
          value={feedDisplay.text}
          color={feedDisplay.color}
          title={feedDisplay.title}
        />

        {status.errors.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <span style={{ color: '#e94560', fontWeight: 600, fontSize: 11 }}>Errors ({status.errors.length}):</span>
            {status.errors.slice(-3).map((err, i) => (
              <div key={i} style={{ color: '#e94560', fontSize: 10, marginTop: 2 }}>
                [{err.code}] {err.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

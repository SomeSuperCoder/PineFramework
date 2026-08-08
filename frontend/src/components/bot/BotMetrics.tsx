import type { BotStatusSnapshot } from '../../types/bot';
import type { ChaosSignalRecord, ChaosHeartbeatRecord } from '../../types';
import { MiniChart } from '../MiniChart';
import { useBotMiniChartData } from '../../hooks/useMiniChartData';
import { MetricValue } from './MetricValue';
import { AutoSelectGrid } from './AutoSelectGrid';
import { DASH, fmtBaseSymbol, fmtDur, fmtPnl, fmtSize, fmtUsd } from '../../utils/format';

function LiveBotView({
  backendUrl,
  activePair,
  strategySource,
  chaosMode,
  chaosSignals,
  chaosHeartbeats,
}: {
  backendUrl: string;
  activePair: { symbol: string; timeframe: string } | null;
  strategySource: string | null;
  chaosMode: boolean;
  chaosSignals: ChaosSignalRecord[];
  chaosHeartbeats: ChaosHeartbeatRecord[];
}) {
  // Mini chart data — fetch OHLCV + execute script for the first configured pair.
  // Lives in a component that only mounts in Running/Stopping/Error states, so the
  // data pipeline (OHLCV fetch, /api/execute, kline WS subscription) never runs
  // while the bot is Idle/Stopped (SetupWizard view).
  const miniChartData = useBotMiniChartData(
    backendUrl,
    activePair?.symbol ?? null,
    activePair?.timeframe ?? null,
    strategySource ?? null,
    chaosMode,
    chaosSignals,
    chaosHeartbeats,
  );

  if (!activePair) return null;

  return (
    <div style={{ marginBottom: 12, borderBottom: '1px solid #1a1a2e', paddingBottom: 12 }}>
      <div style={{ color: '#888', fontWeight: 600, marginBottom: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{activePair.symbol}</span>
        <span style={{ color: '#555', fontWeight: 400 }}>{activePair.timeframe}</span>
        {miniChartData.loading && (
          <span style={{ color: '#ff9800', fontSize: 10, fontWeight: 400 }}>loading…</span>
        )}
      </div>
      <MiniChart
        data={miniChartData.displayCandles}
        scriptResult={miniChartData.displayScriptResult}
        dataVersion={miniChartData.dataVersion}
        height={180}
      />
    </div>
  );
}

// ---- Center: Mini Chart + Metrics + Positions ----

export function BotMetrics({
  backendUrl,
  status,
  activePair,
  strategySource,
  chaosMode,
  chaosSignals,
  chaosHeartbeats,
  autoSelectResult,
  now,
}: {
  backendUrl: string;
  status: BotStatusSnapshot;
  activePair: { symbol: string; timeframe: string } | null;
  strategySource: string | null;
  chaosMode: boolean;
  chaosSignals: ChaosSignalRecord[];
  chaosHeartbeats: ChaosHeartbeatRecord[];
  autoSelectResult?: {
    best: { pair: { symbol: string; timeframe: string }; label: string; metrics: Record<string, number> };
    ranking: Array<{ pair: { symbol: string; timeframe: string }; label: string; metrics: Record<string, number> }>;
    evaluatedCount: number;
    failedCount: number;
  } | null;
  now: number;
}) {
  return (
    <div style={{ borderRight: '1px solid #1a1a2e', padding: 12, overflow: 'auto' }}>
      {/* Mini Chart — only mounted in running states; never while Idle/Stopped */}
      <LiveBotView
        backendUrl={backendUrl}
        activePair={activePair}
        strategySource={strategySource}
        chaosMode={chaosMode}
        chaosSignals={chaosSignals}
        chaosHeartbeats={chaosHeartbeats}
      />

      <div style={{ color: '#888', fontWeight: 600, marginBottom: 8, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Metrics</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
        <MetricValue label="Total Trades" value={status.totalTrades != null ? String(status.totalTrades) : DASH} />
        <MetricValue label="Winning" value={status.winningTrades != null ? String(status.winningTrades) : DASH} color="#4caf50" />
        <MetricValue label="Losing" value={status.losingTrades != null ? String(status.losingTrades) : DASH} color="#e94560" />
        <MetricValue label="Win Rate" value={status.winRate != null ? `${(status.winRate * 100).toFixed(1)}%` : DASH} />
        <MetricValue label="Avg Win" value={status.avgWin != null ? `$${status.avgWin.toFixed(2)}` : DASH} color={status.avgWin != null && status.avgWin > 0 ? '#4caf50' : undefined} />
        <MetricValue label="Avg Loss" value={status.avgLoss != null ? `-$${Math.abs(status.avgLoss).toFixed(2)}` : DASH} color={status.avgLoss != null && status.avgLoss < 0 ? '#e94560' : undefined} />
        <MetricValue label="Profit Factor" value={status.profitFactor != null ? status.profitFactor.toFixed(2) : DASH}
          color={status.profitFactor != null ? status.profitFactor >= 1.5 ? '#4caf50' : status.profitFactor >= 1 ? '#ff9800' : '#e94560' : undefined}
        />
        <MetricValue label="Max Drawdown" value={status.maxDrawdown != null ? `${(status.maxDrawdown * 100).toFixed(1)}%` : DASH} color="#e94560" />
        <MetricValue label="Total Fees" value={status.totalFees != null ? `$${status.totalFees.toFixed(2)}` : DASH} />
        <MetricValue label="Avg Latency" value={status.avgLatency != null ? `${status.avgLatency.toFixed(0)}ms` : DASH} />
      </div>

      {/* Positions */}
      <>
          <div style={{ color: '#888', fontWeight: 600, marginBottom: 8, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Positions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {status.positions.length === 0 && (
              <div style={{ padding: '8px 12px', background: '#111128', borderRadius: 4, color: '#666', fontSize: 11, fontStyle: 'italic' }}>
                No open positions
              </div>
            )}
            {status.positions.map((pos, i) => {
              const pnl = pos.unrealizedPnl ?? 0;
              const pnlPercent = pos.entryPrice > 0 && pos.quantity > 0
                ? (pnl / (pos.entryPrice * pos.quantity)) * 100
                : 0;
              const pnlColor = pnl >= 0 ? '#4caf50' : '#e94560';
              const duration = now - pos.entryTime;
              const isLong = pos.direction !== 'flat';
              return (
                <div key={i} style={{ padding: '8px 12px', background: '#111128', borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#e0e0e0', fontWeight: 600, fontSize: 12 }}>{pos.symbol}</span>
                    {pos.timeframe && (
                      <span style={{ color: '#555', fontSize: 10 }}>{pos.timeframe}</span>
                    )}
                    <span style={{ color: isLong ? '#4caf50' : '#888', fontSize: 11, fontWeight: 600 }}>
                      {isLong ? 'LONG' : 'FLAT'}
                    </span>
                    {pos.direction === 'flat' ||
                    !isFinite(pos.quantity) ||
                    pos.quantity <= 0 ||
                    !isFinite(pos.entryPrice) ? (
                      <span style={{ color: '#666', fontSize: 11 }}>{'\u2014'}</span>
                    ) : (
                      <>
                        <span style={{ color: '#d0d0d0', fontWeight: 600, fontSize: 12 }}>
                          {fmtSize(pos.quantity)} {fmtBaseSymbol(pos.symbol)}
                        </span>
                        {/* Notional = entry size in USD (qty × entry price, not live mark). */}
                        <span style={{ color: '#aaa', fontSize: 11 }}>
                          {'\u2248'} {fmtUsd(pos.quantity * pos.entryPrice)}
                        </span>
                        <span style={{ color: '#888', fontSize: 11 }}>
                          @ ${pos.entryPrice.toFixed(2)}
                        </span>
                      </>
                    )}
                    <span style={{ color: '#888', fontSize: 11, marginLeft: 'auto' }}>
                      {pos.unrealizedPnl != null ? `$${pos.unrealizedPnl.toFixed(2)}` : '\u2014'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11 }}>
                    <span style={{ color: pnlColor, fontWeight: 600 }}>
                      {fmtPnl(pnl).text}
                    </span>
                    <span style={{ color: pnlColor, fontWeight: 600 }}>
                      ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
                    </span>
                    <span style={{ color: '#666', marginLeft: 'auto' }}>
                      {fmtDur(duration)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>

      {/* Auto-Select Results */}
      {autoSelectResult && (
        <div style={{ marginTop: 16 }}>
          <div style={{ color: '#4caf50', fontWeight: 600, fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Auto-Select Results</div>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>
            Evaluated {autoSelectResult.evaluatedCount} pair{autoSelectResult.evaluatedCount !== 1 ? 's' : ''}
            {autoSelectResult.failedCount > 0 && `, ${autoSelectResult.failedCount} failed`}
          </div>
          <AutoSelectGrid
            statuses={Object.fromEntries(
              autoSelectResult.ranking.map(r => [r.label, { phase: 'done', status: 'done' as const }])
            )}
            ranking={autoSelectResult.ranking}
          />
          <div style={{ marginTop: 6, padding: '6px 8px', background: '#1a3328', borderRadius: 3 }}>
            <span style={{ color: '#4caf50', fontWeight: 700, fontSize: 11 }}>
              ★ Best: {autoSelectResult.best.label}
            </span>
            <span style={{ color: '#888', fontSize: 10, marginLeft: 8 }}>
              PF: {autoSelectResult.best.metrics.profitFactor?.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

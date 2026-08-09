import type { BotStatusSnapshot } from '../../types/bot';
import type { ChaosSignalRecord, ChaosHeartbeatRecord } from '../../types';
import { MiniChart } from '../MiniChart';
import { useBotMiniChartData } from '../../hooks/useMiniChartData';
import { Card } from '@/components/ui/card';
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
    <div className="mb-3 border-b border-[var(--color-card)] pb-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-[var(--color-muted-foreground)] uppercase">
        <span>{activePair.symbol}</span>
        <span className="font-normal text-[var(--color-muted-foreground)]">{activePair.timeframe}</span>
        {miniChartData.loading && (
          <span className="text-[10px] font-normal text-[#eab308]">loading…</span>
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
    <div className="overflow-auto border-r border-[var(--color-card)] p-3">
      {/* Mini Chart — only mounted in running states; never while Idle/Stopped */}
      <LiveBotView
        backendUrl={backendUrl}
        activePair={activePair}
        strategySource={strategySource}
        chaosMode={chaosMode}
        chaosSignals={chaosSignals}
        chaosHeartbeats={chaosHeartbeats}
      />

      <div className="mb-2 text-[11px] font-semibold tracking-wider text-[var(--color-muted-foreground)] uppercase">Metrics</div>
      <div className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
        <Card size="sm" className="gap-1 rounded-lg px-3 py-2">
          <MetricValue label="Total Trades" value={status.totalTrades != null ? String(status.totalTrades) : DASH} />
        </Card>
        <Card size="sm" className="gap-1 rounded-lg px-3 py-2">
          <MetricValue label="Winning" value={status.winningTrades != null ? String(status.winningTrades) : DASH} color="#22c55e" />
        </Card>
        <Card size="sm" className="gap-1 rounded-lg px-3 py-2">
          <MetricValue label="Losing" value={status.losingTrades != null ? String(status.losingTrades) : DASH} color="var(--color-destructive)" />
        </Card>
        <Card size="sm" className="gap-1 rounded-lg px-3 py-2">
          <MetricValue label="Win Rate" value={status.winRate != null ? `${(status.winRate * 100).toFixed(1)}%` : DASH} />
        </Card>
        <Card size="sm" className="gap-1 rounded-lg px-3 py-2">
          <MetricValue label="Avg Win" value={status.avgWin != null ? `$${status.avgWin.toFixed(2)}` : DASH} color={status.avgWin != null && status.avgWin > 0 ? '#22c55e' : undefined} />
        </Card>
        <Card size="sm" className="gap-1 rounded-lg px-3 py-2">
          <MetricValue label="Avg Loss" value={status.avgLoss != null ? `-$${Math.abs(status.avgLoss).toFixed(2)}` : DASH} color={status.avgLoss != null && status.avgLoss < 0 ? 'var(--color-destructive)' : undefined} />
        </Card>
        <Card size="sm" className="gap-1 rounded-lg px-3 py-2">
          <MetricValue label="Profit Factor" value={status.profitFactor != null ? status.profitFactor.toFixed(2) : DASH}
            color={status.profitFactor != null ? status.profitFactor >= 1.5 ? '#22c55e' : status.profitFactor >= 1 ? '#eab308' : 'var(--color-destructive)' : undefined}
          />
        </Card>
        <Card size="sm" className="gap-1 rounded-lg px-3 py-2">
          <MetricValue label="Max Drawdown" value={status.maxDrawdown != null ? `${(status.maxDrawdown * 100).toFixed(1)}%` : DASH} color="var(--color-destructive)" />
        </Card>
        <Card size="sm" className="gap-1 rounded-lg px-3 py-2">
          <MetricValue label="Total Fees" value={status.totalFees != null ? `$${status.totalFees.toFixed(2)}` : DASH} />
        </Card>
        <Card size="sm" className="gap-1 rounded-lg px-3 py-2">
          <MetricValue label="Avg Latency" value={status.avgLatency != null ? `${status.avgLatency.toFixed(0)}ms` : DASH} />
        </Card>
      </div>

      {/* Positions */}
      <>
          <div className="mb-2 text-[11px] font-semibold tracking-wider text-[var(--color-muted-foreground)] uppercase">Positions</div>
          <div className="flex flex-col gap-1.5">
            {status.positions.length === 0 && (
              <div className="rounded bg-[var(--color-secondary)]/60 px-3 py-2 text-[11px] italic text-[var(--color-muted-foreground)]">
                No open positions
              </div>
            )}
            {status.positions.map((pos, i) => {
              const pnl = pos.unrealizedPnl ?? 0;
              const pnlPercent = pos.entryPrice > 0 && pos.quantity > 0
                ? (pnl / (pos.entryPrice * pos.quantity)) * 100
                : 0;
              const pnlColor = pnl >= 0 ? '#22c55e' : 'var(--color-destructive)';
              const duration = now - pos.entryTime;
              const isLong = pos.direction !== 'flat';
              return (
                <div key={i} className="flex flex-col gap-1 rounded bg-[var(--color-secondary)]/60 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-[var(--color-foreground)]">{pos.symbol}</span>
                    {pos.timeframe && (
                      <span className="text-[10px] text-[var(--color-muted-foreground)]">{pos.timeframe}</span>
                    )}
                    <span className={`text-[11px] font-semibold ${isLong ? 'text-[#22c55e]' : 'text-[var(--color-muted-foreground)]'}`}>
                      {isLong ? 'LONG' : 'FLAT'}
                    </span>
                    {pos.direction === 'flat' ||
                    !isFinite(pos.quantity) ||
                    pos.quantity <= 0 ||
                    !isFinite(pos.entryPrice) ? (
                      <span className="text-[11px] text-[var(--color-muted-foreground)]">{'\u2014'}</span>
                    ) : (
                      <>
                        <span className="text-[12px] font-semibold text-[var(--color-muted-foreground)]">
                          {fmtSize(pos.quantity)} {fmtBaseSymbol(pos.symbol)}
                        </span>
                        {/* Notional = entry size in USD (qty × entry price, not live mark). */}
                        <span className="text-[11px] text-[var(--color-muted-foreground)]">
                          {'\u2248'} {fmtUsd(pos.quantity * pos.entryPrice)}
                        </span>
                        <span className="text-[11px] text-[var(--color-muted-foreground)]">
                          @ ${pos.entryPrice.toFixed(2)}
                        </span>
                      </>
                    )}
                    <span className="ml-auto text-[11px] text-[var(--color-muted-foreground)]">
                      {pos.unrealizedPnl != null ? `$${pos.unrealizedPnl.toFixed(2)}` : '\u2014'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span style={{ color: pnlColor }} className="font-semibold">
                      {fmtPnl(pnl).text}
                    </span>
                    <span style={{ color: pnlColor }} className="font-semibold">
                      ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
                    </span>
                    <span className="ml-auto text-[var(--color-muted-foreground)]">
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
        <div className="mt-4">
          <div className="mb-1 text-[11px] font-semibold tracking-wider text-[#22c55e] uppercase">Auto-Select Results</div>
          <div className="mb-1 text-[11px] text-[var(--color-muted-foreground)]">
            Evaluated {autoSelectResult.evaluatedCount} pair{autoSelectResult.evaluatedCount !== 1 ? 's' : ''}
            {autoSelectResult.failedCount > 0 && `, ${autoSelectResult.failedCount} failed`}
          </div>
          <AutoSelectGrid
            statuses={Object.fromEntries(
              autoSelectResult.ranking.map(r => [r.label, { phase: 'done', status: 'done' as const }])
            )}
            ranking={autoSelectResult.ranking}
          />
          <div className="mt-1.5 rounded bg-[rgba(34,197,94,0.12)] px-2 py-1.5">
            <span className="text-[11px] font-semibold text-[#22c55e]">
              ★ Best: {autoSelectResult.best.label}
            </span>
            <span className="ml-2 text-[10px] text-[var(--color-muted-foreground)]">
              PF: {autoSelectResult.best.metrics.profitFactor?.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

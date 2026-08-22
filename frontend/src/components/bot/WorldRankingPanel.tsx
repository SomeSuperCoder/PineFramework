import { useId } from 'react';
import type { WorldRankingEntry } from '../../types/multiWorld';

interface WorldRankingPanelProps {
  ranking: WorldRankingEntry[]; // sorted desc by pnl
  positiveCount: number;
  topN: number;
  onTopNChange: (n: number) => void;
  selectedKeys: Set<string>;
  onToggleWorld: (worldKey: string) => void;
}

const formatTimeframe = (tf: string) =>
  tf === '5' ? '5m' : tf === '15' ? '15m' : tf === '60' ? '1h' : tf === '240' ? '4h' : tf;

/**
 * F5 — PnL-sorted world ranking with a "trade top N" picker.
 *
 * Positive worlds are shown first; a labeled PnL=0 divider separates them from
 * non-positive worlds (not color-only — it carries text). Top-N rows are
 * auto-highlighted; the user may toggle any row to override the selection.
 */
export function WorldRankingPanel({
  ranking,
  positiveCount,
  topN,
  onTopNChange,
  selectedKeys,
  onToggleWorld,
}: WorldRankingPanelProps) {
  const topNId = useId();
  if (ranking.length === 0) {
    return (
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)]/40 p-3 text-[11px] text-[var(--color-muted-foreground)]">
        No worlds evaluated.
      </div>
    );
  }

  const positive = ranking.filter((w) => w.pnlPercent > 0);
  const nonPositive = ranking.filter((w) => w.pnlPercent <= 0);
  const selectedCount = selectedKeys.size;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label htmlFor={topNId} className="text-[11px] font-semibold text-[var(--color-muted-foreground)]">
          Trade top N worlds
        </label>
        <input
          id={topNId}
          type="number"
          min={1}
          max={positiveCount}
          value={topN}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onTopNChange(Math.min(Math.max(1, n), positiveCount));
          }}
          className="w-[64px] rounded border border-[var(--color-border)] bg-[var(--color-secondary)] px-1.5 py-1 text-[11px] text-[var(--color-foreground)]"
        />
        <span className="text-[10px] text-[var(--color-muted-foreground)]">
          {selectedCount} of {positiveCount} positive-PnL worlds selected
        </span>
      </div>

      {positiveCount === 0 && (
        <div className="rounded border border-[var(--color-warning)] bg-[rgba(234,179,8,0.12)] px-2 py-1.5 text-[10px] text-[#eab308]">
          Only non-positive worlds available — go back and pick another strategy.
        </div>
      )}

      <div className="max-h-[260px] overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-card)]/40 p-2">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="text-[var(--color-muted-foreground)]">
              <th className="text-left font-semibold">#</th>
              <th className="text-left font-semibold">World</th>
              <th className="text-right font-semibold">PnL</th>
              <th className="text-right font-semibold">PF</th>
              <th className="text-right font-semibold">Sharpe</th>
              <th className="text-center font-semibold">Trade</th>
            </tr>
          </thead>
          <tbody>
            {positive.map((w, i) => (
              <WorldRow
                key={w.worldKey}
                rank={i + 1}
                world={w}
                selected={selectedKeys.has(w.worldKey)}
                onToggle={() => onToggleWorld(w.worldKey)}
              />
            ))}
            {nonPositive.length > 0 && (
              <tr>
                <td colSpan={6} className="pt-1.5 text-center text-[9px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                  — PnL ≤ 0 (not traded) —
                </td>
              </tr>
            )}
            {nonPositive.map((w, i) => (
              <WorldRow
                key={w.worldKey}
                rank={positive.length + i + 1}
                world={w}
                selected={selectedKeys.has(w.worldKey)}
                onToggle={() => onToggleWorld(w.worldKey)}
                muted
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WorldRow({
  rank,
  world,
  selected,
  onToggle,
  muted,
}: {
  rank: number;
  world: WorldRankingEntry;
  selected: boolean;
  onToggle: () => void;
  muted?: boolean;
}) {
  const pnlPositive = world.pnlPercent >= 0;
  return (
    <tr className={muted ? 'opacity-60' : selected ? 'bg-[rgba(var(--color-primary),0.08)]' : ''}>
      <td className="py-0.5 pr-1 text-[var(--color-muted-foreground)] tabular-nums">{rank}</td>
      <td className="py-0.5 pr-1 text-[var(--color-foreground)]">
        {world.symbol} · {formatTimeframe(world.timeframe)} · {world.strategyName ?? world.strategyId}
      </td>
      <td
        className="py-0.5 pr-1 text-right tabular-nums"
        style={{ color: pnlPositive ? '#22c55e' : 'var(--color-destructive)' }}
      >
        {pnlPositive ? '+' : ''}
        {world.pnlPercent.toFixed(2)}%
      </td>
      <td className="py-0.5 pr-1 text-right tabular-nums text-[var(--color-muted-foreground)]">
        {world.profitFactor != null ? world.profitFactor.toFixed(2) : '—'}
      </td>
      <td className="py-0.5 pr-1 text-right tabular-nums text-[var(--color-muted-foreground)]">
        {world.sharpeRatio != null ? world.sharpeRatio.toFixed(2) : '—'}
      </td>
      <td className="py-0.5 text-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Trade ${world.symbol} ${world.timeframe}`}
          className="accent-[var(--color-primary)]"
        />
      </td>
    </tr>
  );
}

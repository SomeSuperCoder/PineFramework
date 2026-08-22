import { useId } from 'react';
import type { AllocationEntry } from '../../types/multiWorld';

interface CapitalAllocationPanelProps {
  allocation: AllocationEntry[]; // selected worlds with weight + allocatedUsdc
  totalCapital: number;
  onTotalCapitalChange: (n: number) => void;
  /** D6 — visible, non-blocking note that live balance is NOT used for the math. */
  balanceWarning?: boolean;
}

const formatTimeframe = (tf: string) =>
  tf === '5' ? '5m' : tf === '15' ? '15m' : tf === '60' ? '1h' : tf === '240' ? '4h' : tf;

/**
 * F5 — PnL-weighted USDC split display.
 *
 * The split is computed by the caller (largest-remainder rounding, see
 * `computeAllocation`) and passed in as `allocation`. This panel is
 * presentational: it shows the total-capital input, per-world weight % and
 * allocated USDC, and the Σ total row, plus the D6 explicit-capital note.
 *
 * D6: capital is an EXPLICIT user input — the live wallet balance is never used
 * for the allocation math (balance source is pending / stubbed).
 */
export function CapitalAllocationPanel({
  allocation,
  totalCapital,
  onTotalCapitalChange,
}: CapitalAllocationPanelProps) {
  const capId = useId();

  if (allocation.length === 0) {
    return (
      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)]/40 p-3 text-[11px] text-[var(--color-muted-foreground)]">
        Select worlds in the previous step first.
      </div>
    );
  }

  const invalid = !(totalCapital > 0);
  const allocatedSum = allocation.reduce((s, a) => s + a.allocatedUsdc, 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label htmlFor={capId} className="text-[11px] font-semibold text-[var(--color-muted-foreground)]">
          Total capital (USDC)
        </label>
        <input
          id={capId}
          type="number"
          min={0}
          step="0.01"
          value={totalCapital}
          onChange={(e) => {
            const n = Number(e.target.value);
            onTotalCapitalChange(Number.isFinite(n) ? n : 0);
          }}
          className="w-[120px] rounded border border-[var(--color-border)] bg-[var(--color-secondary)] px-1.5 py-1 text-[11px] text-[var(--color-foreground)]"
        />
      </div>
      {invalid && (
        <div className="text-[10px] text-[var(--color-destructive)]">
          Enter a capital amount greater than 0
        </div>
      )}

      <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-card)]/40 p-2">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="text-[var(--color-muted-foreground)]">
              <th className="text-left font-semibold">World</th>
              <th className="text-right font-semibold">Weight</th>
              <th className="text-right font-semibold">Allocated USDC</th>
            </tr>
          </thead>
          <tbody>
            {allocation.map((a) => (
              <tr key={a.worldKey}>
                <td className="py-0.5 pr-1 text-[var(--color-foreground)]">
                  {a.symbol} · {formatTimeframe(a.timeframe)} · {a.strategyName ?? a.strategyId}
                </td>
                <td className="py-0.5 pr-1 text-right tabular-nums text-[var(--color-muted-foreground)]">
                  {(a.weight * 100).toFixed(1)}%
                </td>
                <td className="py-0.5 pr-1 text-right tabular-nums text-[var(--color-foreground)]">
                  ${a.allocatedUsdc.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[var(--color-border)]">
              <td className="py-0.5 pr-1 font-semibold text-[var(--color-foreground)]">Σ Total</td>
              <td className="py-0.5 pr-1 text-right tabular-nums text-[var(--color-muted-foreground)]">100%</td>
              <td className="py-0.5 pr-1 text-right tabular-nums font-semibold text-[var(--color-foreground)]">
                ${allocatedSum.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="text-[10px] text-[var(--color-muted-foreground)]">
        Capital is allocated from the amount you enter; live wallet balance is not used for the math
        (balance source pending).
      </div>
    </div>
  );
}

import type { AllocationEntry, NormalizedWorld } from '../types/multiWorld';
import { pnlOf } from '../types/multiWorld';

/**
 * PnL-weighted USDC split across selected worlds (D5).
 *
 * weight_i = pnl_i / Σ pnl_selected
 * allocatedUsdc_i = total × weight  (fractional)
 * Then largest-remainder rounding distributes the integer dust to the largest
 * fractional remainders so Σ allocated == total (within 1e-6).
 */
export function computeAllocation(
  selected: NormalizedWorld[],
  totalCapital: number,
): AllocationEntry[] {
  if (selected.length === 0 || !(totalCapital > 0)) return [];

  const pnls = selected.map((w) => Math.max(0, pnlOf(w.metrics)));
  const sumPnl = pnls.reduce((s, p) => s + p, 0);

  // Guard: if every selected world has non-positive PnL, fall back to equal split.
  const weights =
    sumPnl > 0
      ? pnls.map((p) => p / sumPnl)
      : selected.map(() => 1 / selected.length);

  const exact = weights.map((w) => totalCapital * w);
  const floored = exact.map((v) => Math.floor(v * 100) / 100); // 2-dp floor
  const remainders = exact.map((v, i) => ({ i, rem: v - floored[i] }));
  let allocatedSoFar = floored.reduce((s, v) => s + v, 0);
  let dust = Math.round((totalCapital - allocatedSoFar) * 100) / 100;

  // Distribute dust (in 0.01 increments) to the largest remainders.
  remainders.sort((a, b) => b.rem - a.rem);
  const adjust = new Array(selected.length).fill(0);
  while (dust >= 0.005 && remainders.length > 0) {
    const top = remainders.shift()!;
    adjust[top.i] += 0.01;
    dust = Math.round((dust - 0.01) * 100) / 100;
  }

  return selected.map((w, i) => ({
    ...w,
    pnlPercent: pnlOf(w.metrics),
    weight: weights[i],
    allocatedUsdc: Math.round((floored[i] + adjust[i]) * 100) / 100,
  }));
}

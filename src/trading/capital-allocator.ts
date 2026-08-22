/**
 * CapitalAllocator — PnL-weighted USDC capital distribution (OpenSpec change:
 * multi-world-portfolio-trading, design decision D5).
 *
 * WHY this module exists:
 *   Multi-world portfolios must split a single USDC capital figure across N
 *   worlds in proportion to each world's backtest PnL. The sum of slices MUST
 *   equal the total capital exactly (no lost/extra dust), and one world's
 *   sizing must never draw on another world's slice (spec:
 *   world-capital-allocation "per-world sizing enforcement").
 *
 * METHOD — largest-remainder (Hamilton), PURE INTEGER space:
 *   - Weights (PnL, possibly fractional) are scaled to integers via SCALE so the
 *     ratio is preserved exactly and we never divide floats.
 *   - Each slice = floor(totalUnits * w_i / sumW); the dropped fractional part is
 *     `(totalUnits * w_i) mod sumW` — an exact integer.
 *   - Residual dust (whole smallest units flooring dropped) is handed out one unit
 *     at a time to the worlds with the largest remainder. Ties break by largest
 *     weight, then by stable original index — fully deterministic.
 *   - Integer `mod` (not float division) guarantees the locked scenario
 *     20 -> 4/6/10 with zero float drift, and the sum invariant holds exactly.
 *
 * DI (architecture law: depend on abstraction, inject don't instantiate):
 *   Consumers depend only on the narrow `CapitalAllocator` interface. The
 *   concrete `DefaultCapitalAllocator` is wired at the composition root (the
 *   LiveStrategyExecutor sizing seam, B4) — never constructed inside a consumer.
 */

/** One world's PnL weight for allocation. `pnl` is the backtest PnL (e.g. +2, +3, +5). */
export interface WorldWeight {
  id: string;
  pnl: number;
}

/** Optional knobs for a single allocation call. */
export interface CapitalAllocatorOptions {
  /**
   * Smallest allocatable unit. Default 1 = whole USDC (no fractional on-chain).
   * Pass 0.01 to allocate in integer cents. The returned slice values are always
   * whole multiples of `unit`.
   */
  unit?: number;
}

/**
 * Narrow seam the executor depends on (dependency inversion). The executor
 * injects an implementation at the positionFraction sizing seam and never
 * constructs one itself.
 */
export interface CapitalAllocator {
  allocate(
    total: number,
    worlds: WorldWeight[],
    options?: CapitalAllocatorOptions,
  ): Map<string, number>;
}

/** Scale factor converting (possibly fractional) PnL weights to exact integers. */
const WEIGHT_SCALE = 1_000_000;

/**
 * Split `total` USDC across `worlds` proportional to PnL.
 *
 * @returns Map<worldId, allocatedUsdc>. Sum of values === `total` exactly.
 *          Zero/negative-PnL worlds are skipped (already filtered upstream per D5,
 *          but defensively ignored here). If no positive weight remains, an empty
 *          Map is returned (nothing to allocate).
 */
export function allocateCapital(
  total: number,
  worlds: WorldWeight[],
  options?: CapitalAllocatorOptions,
): Map<string, number> {
  const unit = options?.unit ?? 1;
  const result = new Map<string, number>();

  // Nothing to allocate, or an invalid unit — return empty (caller handles).
  if (!(total > 0) || !(unit > 0) || !Number.isFinite(total)) return result;

  // Keep only positive, finite PnL worlds; attach a stable original index.
  const indexed = worlds
    .map((w, idx) => ({ id: w.id, w: Math.round(w.pnl * WEIGHT_SCALE), idx }))
    .filter((x) => x.w > 0);
  if (indexed.length === 0) return result;

  const sumW = indexed.reduce((s, x) => s + x.w, 0);
  if (!(sumW > 0)) return result;

  // Work in "unit" space so slices are whole multiples of `unit`.
  const totalUnits = Math.round(total / unit);
  if (totalUnits <= 0) return result;

  let allocatedUnits = 0;
  const shares = indexed.map((x) => {
    const numerator = totalUnits * x.w;
    const floorUnits = Math.floor(numerator / sumW);
    // Exact integer remainder — no float division drift possible.
    const remainder = numerator - floorUnits * sumW;
    result.set(x.id, floorUnits * unit);
    allocatedUnits += floorUnits;
    return { id: x.id, w: x.w, idx: x.idx, remainder };
  });

  // Distribute residual dust (whole units) to largest-remainder worlds first.
  let residual = totalUnits - allocatedUnits;
  if (residual > 0) {
    const order = [...shares].sort((a, b) => {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder; // largest remainder
      if (b.w !== a.w) return b.w - a.w; // largest weight tie-break
      return a.idx - b.idx; // stable: earliest index wins
    });
    for (let i = 0; i < residual; i++) {
      const target = order[i];
      result.set(target.id, (result.get(target.id) ?? 0) + unit);
    }
  }

  return result;
}

/**
 * Default `CapitalAllocator` implementation (Hamilton/largest-remainder).
 * Wire this (or a test double) into the executor at the composition root.
 */
export class DefaultCapitalAllocator implements CapitalAllocator {
  constructor(private readonly defaultUnit: number = 1) {}

  allocate(
    total: number,
    worlds: WorldWeight[],
    options?: CapitalAllocatorOptions,
  ): Map<string, number> {
    return allocateCapital(total, worlds, { unit: options?.unit ?? this.defaultUnit });
  }
}

/** Shared singleton the executor falls back to when no allocator is injected. */
export const defaultCapitalAllocator: CapitalAllocator = new DefaultCapitalAllocator();

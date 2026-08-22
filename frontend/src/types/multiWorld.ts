/**
 * Multi-world portfolio trading — shared frontend domain types.
 *
 * These types support the reworked auto-backtester wizard (tasks F2–F5 of the
 * `multi-world-portfolio-trading` change). The WS payloads (`AutoSelectProgressV2`
 * / `AutoSelectResultV2`) are intentionally tolerant: the backend auto-select
 * contract is migrating from a single-best (`best.pair`) shape to a multi-world
 * PnL-ranked shape (`worlds`/`positiveWorlds`/`ranking`/`blocked`). The
 * normalization helpers in `useAutoSelectProgress.ts` turn either shape into the
 * stable `NormalizedWorld` model the UI consumes, so the frontend works whether
 * or not the backend has shipped the V2 contract yet.
 */

export type WizardStep =
  | 'wallet'
  | 'config'
  | 'strategies'
  | 'backtest'
  | 'ranking'
  | 'allocation'
  | 'review';

export interface SelectedStrategy {
  id: string;
  name: string;
  source: string;
  isBuiltIn: boolean;
}

/** A world = strategy + timeframe + symbol. Backend key `${symbol}:${timeframe}:${strategyId}`. */
export interface WorldRef {
  worldKey: string;
  strategyId: string;
  symbol: string;
  timeframe: string;
}

export type CandidatePhase = 'fetching' | 'backtesting' | 'done';
export type CandidateStatus = 'pending' | 'active' | 'done' | 'failed';

/** One candidate world's live status (progress grid row). */
export interface CandidateStatusEntry {
  worldKey: string;
  label: string;
  strategyId: string;
  symbol: string;
  timeframe: string;
  phase: CandidatePhase;
  status: CandidateStatus;
  slot?: number; // concurrency slot 0..concurrency-1 when active
  error?: string;
  pnlPercent?: number;
  profitFactor?: number;
  sharpeRatio?: number;
}

/** A world evaluated by the backtest, normalized across backend shapes. */
export interface NormalizedWorld extends WorldRef {
  label: string;
  strategyName?: string;
  source?: string;
  isBuiltIn?: boolean;
  metrics: Record<string, number>;
  pair: { symbol: string; timeframe: string };
}

export interface WorldRankingEntry extends NormalizedWorld {
  pnlPercent: number;
  profitFactor?: number;
  sharpeRatio?: number;
  selected: boolean;
}

export interface AllocationEntry extends NormalizedWorld {
  pnlPercent: number;
  weight: number; // 0..1
  allocatedUsdc: number; // after largest-remainder rounding (D5)
}

// ---- WS payload shapes (tolerant of legacy + V2) ----

export interface AutoSelectProgressV2 {
  current: number; // completed candidates
  total: number; // total candidates
  concurrency?: number; // p-limit size (~4)
  activeWorlds?: string[]; // worldKeys currently 'active' (<= concurrency)
  statuses: Record<
    string,
    {
      phase: string;
      status: CandidateStatus;
      error?: string;
      slot?: number;
    }
  >;
  candleProgress?: { worldKey?: string; fetched: number; total: number }; // per active fetch
  ranking?: Array<{ worldKey?: string; label: string; metrics: Record<string, number> }>; // partial, grows as done
  // legacy shim (single-pair backends)
  pair?: { symbol: string; timeframe: string };
}

export interface AutoSelectResultV2 {
  blocked: boolean; // true => zero positive-PnL (D1)
  worlds: NormalizedWorld[]; // full evaluated set
  positiveWorlds: NormalizedWorld[]; // pnl > 0 only
  ranking: NormalizedWorld[]; // sorted desc by pnl
  best: NormalizedWorld | null; // shim for legacy consumers (review / BotMetrics)
  positiveCount: number;
  evaluatedCount: number;
  failedCount: number;
}

export function pnlOf(metrics: Record<string, number> | undefined): number {
  if (!metrics) return 0;
  const v = metrics.totalPnlPercent ?? metrics.pnlPercent ?? 0;
  return typeof v === 'number' ? v : 0;
}

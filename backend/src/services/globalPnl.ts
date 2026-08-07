/**
 * globalPnl.ts — Pure data transform for the Telegram /report command.
 *
 * Product data contract for the "Global PnL" snapshot (Director-approved):
 *   totalPnl = realized (session netPnl from trade history) + unrealized
 *              (sum of unrealizedPnl across currently open positions).
 *
 * Deliberately PURE: no i18n, no telegram, no fs/io, no side effects. Takes
 * plain data in, returns a plain snapshot object. The single impure point is
 * `generatedAt`'s Date.now(), and even that is injectable via `now` for tests.
 *
 * Deliberate data decisions (documented for the implementers):
 *  - Money is rounded to 2 decimals (round2), rates/ratios to 1 decimal (round1).
 *    -0 is normalized to +0 so output is deterministic for test assertions.
 *  - `totalPnl` is computed from the ROUNDED components (round2(realized) +
 *    round2(unrealized)) so the report's displayed arithmetic always adds up
 *    (0.00 + 0.00 can never display as 0.01).
 *  - `avgTrade` is reconstructed from the summary as (netPnl + totalFees) /
 *    totalTrades, which exactly mirrors TradeStats.avgTrade = totalPnl /
 *    totalTrades (netPnl = totalPnl - totalFees by definition).
 *  - `profitFactor` sentinel Number.MAX_SAFE_INTEGER ("wins but no losses",
 *    store L581-582) is preserved verbatim — NOT rounded — so the message
 *    builder can render "∞". Every other value is round1'd.
 *  - `perSymbol` is NEVER derived from SessionSummary.recent (last 5 trades):
 *    a 5-trade slice would misrepresent session-scoped per-asset PnL. Callers
 *    pass session-scoped perSymbolStats (StatsService.getGroupedStats('asset',
 *    sameFilters)); absent that, the honest value is an empty array.
 */

import type { SessionSummary } from './StatsService.js';
import type { TradeStats } from 'pine-framework/trading/trade-history-store';

/** Per-asset PnL for the report breakdown. */
export interface GlobalPnlSymbol {
  symbol: string;
  pnl: number;
}

/** Aggregated global PnL snapshot consumed by the Telegram /report message + image. */
export interface GlobalPnlSnapshot {
  totalPnl: number; // realized + unrealized (both rounded; components add up)
  realizedPnl: number; // session netPnl from stats (0 when summary is null)
  unrealizedPnl: number; // sum of open positions' unrealizedPnl (0 when bot off)
  tradeCount: number; // totalTrades
  winRate: number; // fraction 0..1 (store semantics), 1 decimal — multiply by 100 for display
  profitFactor: number; // 1 decimal; MAX_SAFE_INTEGER sentinel preserved ("∞")
  avgTrade: number; // (netPnl + totalFees) / totalTrades, 2 decimals
  maxDrawdown: number;
  totalFees: number;
  bestTrade: number;
  worstTrade: number;
  openPositionsCount: number;
  perSymbol: GlobalPnlSymbol[]; // top 6 by pnl desc; empty array when no data
  engineState: 'running' | 'stopped' | 'error' | 'unknown'; // derived from input param
  generatedAt: number; // injected `now` or Date.now() at build time
}

/** Top-N per-symbol breakdown shown in the report. */
const TOP_SYMBOLS = 6;

/**
 * Round a money value to 2 decimals. -0 is normalized to +0 so snapshots are
 * deterministic (e.g. `Object.is(round2(-0.001), -0)` is false).
 */
export function round2(n: number): number {
  const r = Math.round((n + Number.EPSILON) * 100) / 100;
  return r === 0 ? 0 : r;
}

/** Round a rate/ratio to 1 decimal. -0 is normalized to +0. */
function round1(n: number): number {
  const r = Math.round((n + Number.EPSILON) * 10) / 10;
  return r === 0 ? 0 : r;
}

type EngineState = GlobalPnlSnapshot['engineState'];

/**
 * Map a free-form engine state string ('Running' | 'Error' | 'Stopped' | null
 * per the engine) onto the snapshot's fixed vocabulary. Case-insensitive;
 * anything unrecognized/absent becomes 'unknown' — never throws.
 */
function normalizeEngineState(engineState: string | null | undefined): EngineState {
  switch ((engineState ?? '').trim().toLowerCase()) {
    case 'running':
      return 'running';
    case 'stopped':
      return 'stopped';
    case 'error':
      return 'error';
    default:
      return 'unknown';
  }
}

/**
 * Map pre-grouped asset stats to the per-symbol breakdown. Only the caller's
 * session-scoped grouping is used; pnl = stats.netPnl (realized, after fees),
 * rounded to 2 decimals, sorted descending, capped at TOP_SYMBOLS.
 */
function toSymbols(
  perSymbolStats: Array<{ key: string; stats: TradeStats }> | undefined,
): GlobalPnlSymbol[] {
  if (!perSymbolStats) return [];
  return perSymbolStats
    .map(({ key, stats }) => ({ symbol: key, pnl: round2(stats.netPnl) }))
    .sort((a, b) => b.pnl - a.pnl) // stable sort → ties keep caller's group order
    .slice(0, TOP_SYMBOLS);
}

/**
 * Build the global PnL snapshot for the Telegram /report command.
 *
 * Pure: all inputs are plain values, no I/O, no side effects. Never throws on
 * empty/partial input — null summary, empty positions, absent engineState and
 * absent perSymbolStats all degrade to zeroed/default values.
 *
 * @param input.summary          SessionSummary | null (null when the stats
 *                               service has no data). Session-scoped per the
 *                               caller's filters.
 * @param input.positions        Currently open positions (empty when bot off).
 * @param input.engineState      Free-form engine state string, e.g. 'Running'.
 * @param input.perSymbolStats   Optional pre-grouped per-asset stats — MUST be
 *                               the same session scope as `summary` (pass
 *                               StatsService.getGroupedStats('asset', filters)).
 * @param input.now              Injectable clock (ms epoch) for deterministic tests.
 */
export function buildGlobalPnlSnapshot(input: {
  summary: SessionSummary | null;
  positions: { symbol: string; unrealizedPnl: number }[];
  engineState?: string | null;
  perSymbolStats?: Array<{ key: string; stats: TradeStats }>;
  now?: number;
}): GlobalPnlSnapshot {
  // `?? []` guards a runtime-undefined positions array (never throws).
  const positions = input.positions ?? [];

  // Unrealized is independent of trade history: open positions exist even when
  // the stats service has no closed trades yet (engine on, no exits).
  const unrealized = round2(positions.reduce((sum, p) => sum + p.unrealizedPnl, 0));
  const realized = round2(input.summary ? input.summary.netPnl : 0);

  const avgTrade =
    input.summary && input.summary.totalTrades > 0
      ? (input.summary.netPnl + input.summary.totalFees) / input.summary.totalTrades
      : 0;

  // Preserve the "wins but no losses" sentinel verbatim (see TradeStats L581).
  let profitFactor = input.summary ? input.summary.profitFactor : 0;
  if (profitFactor < Number.MAX_SAFE_INTEGER) profitFactor = round1(profitFactor);

  return {
    // Sum of the rounded components so the report's arithmetic adds up exactly.
    totalPnl: round2(realized + unrealized),
    realizedPnl: realized,
    unrealizedPnl: unrealized,
    tradeCount: input.summary ? input.summary.totalTrades : 0,
    winRate: round1(input.summary ? input.summary.winRate : 0),
    profitFactor,
    avgTrade: round2(avgTrade),
    maxDrawdown: round2(input.summary ? input.summary.maxDrawdown : 0),
    totalFees: round2(input.summary ? input.summary.totalFees : 0),
    bestTrade: round2(input.summary ? input.summary.bestTrade : 0),
    worstTrade: round2(input.summary ? input.summary.worstTrade : 0),
    openPositionsCount: positions.length,
    perSymbol: toSymbols(input.perSymbolStats),
    engineState: normalizeEngineState(input.engineState),
    generatedAt: input.now ?? Date.now(),
  };
}

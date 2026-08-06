/**
 * StatsService — shared in-process aggregations over TradeHistoryStore.
 *
 * Design.md §3: a single aggregation seam consumed by BOTH the REST routes
 * (backend/src/routes/trade-history.ts) and the upcoming Telegram /report
 * command, so both surfaces read the same numbers WITHOUT backend→backend
 * HTTP. The store stays the owner of filtering, ordering, stats math and
 * memoization; every method here is a thin delegation with NO business logic
 * beyond defaulting `includeUnknown` and assembling `getSessionSummary`.
 *
 * Deliberate deviation from the design.md §3 minimum (flagged, not hidden):
 * the REST /bot/history endpoint pages with a composite cursor and must
 * return hasMore/nextCursor, which the design's `getRecentTradesPage(filters,
 * limit)` (TradeRecord[] only) does not carry. `getTradesPage` is an extra
 * pure-delegating passthrough that keeps the route's HTTP contract
 * byte-identical — same shape, same order, same cursor semantics as calling
 * the store directly.
 */

import type {
  TradeFilters,
  TradeHistoryStore,
  TradePageCursor,
  TradeStats,
} from 'pine-framework/trading/trade-history-store';

/**
 * TradeHistoryStore records are NOT re-exported from the pine-framework
 * `trading/trade-history-store` package entry (the store imports them from
 * ./types.ts but never re-exports the name, and the package exports map exposes
 * no ./trading/types path). The store must stay unchanged, so derive the record
 * type from the store's own public getTrades() signature — structurally
 * identical, and any future store signature change flows through automatically.
 */
type TradeRecord = ReturnType<TradeHistoryStore['getTrades']>[number];

/** Grouping dimensions accepted by getGroupedStats; 'global' yields null. */
export type StatsGroupBy = 'global' | 'strategy' | 'timeframe' | 'asset';

/** Compact summary for the Telegram /report command (design.md §3). */
export interface SessionSummary {
  totalTrades: number;
  winRate: number;
  netPnl: number;
  totalFees: number;
  profitFactor: number;
  bestTrade: number;
  worstTrade: number;
  maxDrawdown: number;
  recent: TradeRecord[];
}

/**
 * How many recent trades getSessionSummary attaches. The /report message is a
 * compact overview — dumping the full history would defeat that, and the bot
 * has paginated access via getRecentTradesPage/getTradesPage if needed.
 */
const SESSION_RECENT_LIMIT = 5;

export class StatsService {
  constructor(private readonly store: TradeHistoryStore) {}

  /**
   * Aggregate stats over the (optionally filtered) trade set. Unknown-status
   * trades are excluded unless includeUnknown is explicitly true — the same
   * default the store applies when the flag is absent.
   */
  getStats(filters?: TradeFilters & { includeUnknown?: boolean }): TradeStats {
    return this.store.getStats({
      ...filters,
      includeUnknown: filters?.includeUnknown ?? false,
    });
  }

  /**
   * Stats grouped by a dimension. 'global' has no groups → null (matches the
   * REST route's null-groups contract and gives the Telegram consumer a single
   * shape for both branches). Non-global returns Record<string, TradeStats>
   * keyed by group, preserving the store's group order (insertion order).
   */
  getGroupedStats(
    groupBy: StatsGroupBy,
    filters?: TradeFilters & { includeUnknown?: boolean },
  ): Record<string, TradeStats> | null {
    if (groupBy === 'global') return null;

    const groups = this.store.getGroupedStats(groupBy, {
      ...filters,
      includeUnknown: filters?.includeUnknown ?? false,
    });
    // Store shape: Array<{ key, stats }>; design.md §3 shape: Record. The map
    // preserves the array's insertion order, so consumers that reconstruct the
    // array keep the exact same ordering as calling the store directly.
    return Object.fromEntries(groups.map((g) => [g.key, g.stats]));
  }

  /** Newest-first trades, optionally filtered and capped at `limit`. */
  getRecentTrades(filters?: TradeFilters, limit?: number): TradeRecord[] {
    return this.store.getTrades({ ...filters, limit });
  }

  /**
   * Newest-first trades for the first page — the .trades slice of
   * getTradesPage().trades, without cursor/meta. Telegram-friendly.
   */
  getRecentTradesPage(filters?: TradeFilters, limit?: number): TradeRecord[] {
    return this.store.getTradesPage({ ...filters, limit }).trades;
  }

  /**
   * Full cursor-paginated page (trades + hasMore + nextCursor). Extra beyond
   * the design.md §3 minimum: the REST /bot/history endpoint needs the cursor
   * contract and the page meta, which getRecentTradesPage does not expose.
   * Pure delegation — the store's pagination contract is untouched.
   */
  getTradesPage(options: TradeFilters & { cursor?: TradePageCursor; limit?: number }): {
    trades: TradeRecord[];
    hasMore: boolean;
    nextCursor: TradePageCursor | null;
  } {
    return this.store.getTradesPage(options);
  }

  /**
   * Compact /report payload: headline metrics over the filtered set plus a
   * small slice of the most recent trades. All numbers come from getStats, so
   * the summary and the route's summary are the same values by construction.
   */
  getSessionSummary(filters?: TradeFilters & { includeUnknown?: boolean }): SessionSummary {
    const stats = this.getStats(filters);
    const recent = this.getRecentTrades(filters, SESSION_RECENT_LIMIT);
    return {
      totalTrades: stats.totalTrades,
      winRate: stats.winRate,
      netPnl: stats.netPnl,
      totalFees: stats.totalFees,
      profitFactor: stats.profitFactor,
      bestTrade: stats.bestTrade,
      worstTrade: stats.worstTrade,
      maxDrawdown: stats.maxDrawdown,
      recent,
    };
  }
}

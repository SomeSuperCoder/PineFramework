/**
 * Trade history + statistics types (design D4/D5 — the trading-stats-dashboard
 * change). Mirror of the backend contracts served by
 * GET /api/bot/history and GET /api/bot/stats — keep in lockstep with
 * backend/src/routes/trade-history.ts and src/trading/types.ts TradeRecord.
 */

/** A persisted closed trade as recorded by the bot engine at the close path.
 *  `realizedPnl` is GROSS (fees not included); `fees` is always 0 in this
 *  version (locked fees=0 decision — no reliable fee source; real fee parsing
 *  is deferred to a future change), so `netPnl` equals `grossPnl` and the UI
 *  labels PnL as gross (fees not included). */
export interface TradeRecord {
  id: string;
  botId: string;
  symbol: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  exitPrice: number;
  size: number;
  fees: number;
  realizedPnl: number;
  dex: string;
  transactionSignature?: string;
  openedAt: number;
  closedAt: number;
  strategy?: string;
  timeframe?: string;
  /** Absent on legacy lines recorded before the mode dimension existed. */
  mode?: 'live' | 'chaos';
  /** Unknown-outcome closes are recorded but excluded from default stats. */
  status?: 'confirmed' | 'unknown';
}

export type TradeHistoryMode = 'all' | 'live' | 'chaos';
export type TradeHistoryStatus = 'all' | 'confirmed' | 'unknown';
export type TradeGroupBy = 'global' | 'strategy' | 'timeframe' | 'asset';

export interface TradeStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  /** Fraction in [0, 1] — multiply by 100 for display. */
  winRate: number;
  totalPnl: number;
  totalFees: number;
  averageWin: number;
  /** Negative when there are losing trades (sum of losses / count). */
  averageLoss: number;
  netPnl: number;
  /** Wins-with-no-losses is clamped by the backend to MAX_SAFE_INTEGER. */
  profitFactor: number;
  avgTrade: number;
  bestTrade: number;
  worstTrade: number;
  maxDrawdown: number;
}

export interface TradeStatsGroup {
  key: string;
  stats: TradeStats;
}

export interface TradeHistoryResponse {
  success: boolean;
  trades: TradeRecord[];
  hasMore: boolean;
  nextCursor: string | null;
  error?: string;
}

export interface TradeStatsResponse {
  success: boolean;
  summary: TradeStats;
  groups: TradeStatsGroup[] | null;
  error?: string;
}

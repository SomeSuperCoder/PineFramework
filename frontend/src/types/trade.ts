/**
 * Trade history + statistics types (design D4/D5 — the trading-stats-dashboard
 * change). Mirror of the backend contracts served by
 * GET /api/bot/history and GET /api/bot/stats — keep in lockstep with
 * backend/src/routes/trade-history.ts and src/trading/types.ts TradeRecord.
 */

/** A persisted closed trade as recorded by the bot engine at the close path.
 *  `realizedPnl` is NET (gross minus the fee kinds the anchor subtracted — pnl
 *  module `RealizedPnl.net`); `fees` is that anchor-subtracted total (0 when
 *  none were subtracted, when fees are unknown — `feesUnknown` then flags the
 *  record — or on legacy locked-0 rows). `grossPnl` carries the gross; legacy
 *  (pre-M5) rows wrote GROSS into `realizedPnl` and have no `grossPnl` —
 *  readers needing gross fall back to `realizedPnl` when `grossPnl` is absent.
 *  Mirror of backend src/trading/types.ts TradeRecord. */
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
  /** GROSS realized PnL in quote units (USDC), before fees (pnl module
   *  `RealizedPnl.gross`). Absent on legacy (pre-M5) records — those wrote
   *  gross into `realizedPnl`. */
  grossPnl?: number;
  /** Per-kind fee amounts in quote units (USDC), keyed by pnl FeeKind
   *  ('VENUE', 'PLATFORM', 'PRIORITY', 'BASE', 'JITO'). Absent when no fee
   *  was convertible/observed or on legacy records. */
  feeBreakdown?: Record<string, number>;
  /** True when the fee numbers could not be fully determined (no observed
   *  fee source, adapter feeUnknown, or a needed mint→quote price missing).
   *  Absent (false) on legacy records. */
  feesUnknown?: boolean;
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
  /** GROSS realized PnL (before fees) — Σ (grossPnl ?? realizedPnl). Legacy
   *  (pre-M5) rows lack grossPnl and wrote gross into realizedPnl, so they
   *  fall back to realizedPnl; post-M5 rows carry the explicit gross.
   *  netPnl = totalPnl − totalFees by identity. */
  totalPnl: number;
  /** Explicit SSOT name for the gross total — identical to totalPnl (alias). */
  totalGrossPnl: number;
  totalFees: number;
  averageWin: number;
  /** Negative when there are losing trades (sum of losses / count). */
  averageLoss: number;
  /** totalGrossPnl − totalFees — the SSOT identity (net = gross − fees). */
  netPnl: number;
  /** Count of trades whose fee total could not be fully determined (feesUnknown === true). */
  feesUnknownTrades: number;
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

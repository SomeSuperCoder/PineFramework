/**
 * Shared type definitions for Strategy Engine.
 * Extracted from strategy-engine.ts for reusability.
 */

/** Typical number of trading days per year used for Sharpe/Sortino annualization. */
export const TRADING_DAYS_PER_YEAR = 252;
/** Small epsilon to guard against division by subnormal values in Sharpe/Sortino. */
export const STD_EPSILON = 1e-15;

export type OrderDirection = 'long' | 'short';
export type OrderAction = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop' | 'stop-limit';
export type PositionDirection = 'long' | 'short' | 'flat';
export type QtyType = 'contracts' | 'percent_of_equity' | 'cash';
export type CommissionType = 'percent' | 'fixed' | 'per_contract' | 'per_order';
export type MarketFillPrice = 'open' | 'ohlc4' | 'close' | 'high' | 'low';

import type {
  CommissionMethodId,
  CommissionMethodSettings,
} from './commission-calculator.js';

export interface Account {
  initialCapital: number;
  balance: number;
  equity: number;
  marginUsed: number;
  freeMargin: number;
}

export interface Order {
  id: string;
  symbol: string;
  direction: OrderDirection;
  action: OrderAction;
  type: OrderType;
  quantity: number;
  price: number;
  stopPrice?: number;
  limitPrice?: number;
  entryName: string;
  timestamp: number;
  barIndex: number;
  slippage: number;
  commission: number;
  ocaGroup?: string;
  trailPrice?: number;
  trailOffset?: number;
  fromEntry?: string;
}

export interface FilledOrder extends Order {
  fillPrice: number;
  fillTime: number;
  fillBarIndex: number;
}

export interface PositionLot {
  entryName: string;
  quantity: number;
  avgPrice: number;
  timestamp: number;
  barIndex: number;
}

export interface Position {
  symbol: string;
  direction: PositionDirection;
  quantity: number;
  avgPrice: number;
  entryTime: number;
  entryBarIndex: number;
  entryName: string;
  pnl: number;
  pnlPercent: number;
  commission: number;
  unrealizedPnl: number;
  /** FIFO queue of entry lots for tracking position composition (used by from_entry). */
  lots: PositionLot[];
}

export interface Trade {
  id: string;
  symbol: string;
  direction: OrderDirection;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  entryBarIndex: number;
  exitBarIndex: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  commission: number;
  entryName: string;
  exitName: string;
  mae: number;
  mfe: number;
  barsHeld: number;
}

export interface StrategyMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  totalPnl: number;
  totalPnlPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  averageTradeDuration: number;
  commission: number;
}

export interface StrategyConfig {
  initialCapital: number;
  commission: number;
  slippage: number;
  commissionType: CommissionType;
  slippageType: 'percent' | 'ticks' | 'points';
  defaultQty: number;
  defaultQtyType: QtyType;
  pyramiding: number;
  calcOnOrderFills: boolean;
  calcOnEveryTick: boolean;
  processOrdersOnClose: boolean;
  maxBarsBack: number;
  marginLong: number;
  marginShort: number;
  currency: string;
  /** How to price market order fills: 'open' (default), 'ohlc4' (OHLC/4 average), 'close', 'high', or 'low'. */
  marketFillPrice: MarketFillPrice;
  /** Pluggable commission method ID. When set, overrides legacy commissionType/commission. */
  commissionMethod?: CommissionMethodId;
  /** Settings for the pluggable commission method. */
  commissionMethodSettings?: CommissionMethodSettings;
  /**
   * Trading pair symbol (e.g. "SOLUSDT", "BTCUSDT").
   * Used for auto-detecting Jupiter fee tiers from the token pair.
   * Optional — only relevant when using Jupiter Ultra commission method.
   */
  symbol?: string;
}

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  initialCapital: 10000,
  commission: 0,
  slippage: 0,
  commissionType: 'percent',
  slippageType: 'ticks',
  defaultQty: 100,
  defaultQtyType: 'percent_of_equity',
  pyramiding: 0,
  calcOnOrderFills: true,
  calcOnEveryTick: false,
  processOrdersOnClose: false,
  maxBarsBack: 0,
  marginLong: 0,
  marginShort: 0,
  currency: 'USD',
  marketFillPrice: 'open',
};

export interface TrailingStopState {
  orderId: string;
  trailOffset?: number;
  trailPrice?: number;
  highestPrice: number;
  stopPrice: number;
  isActivated: boolean;
}

export interface StrategyMarker {
  type: 'entry' | 'exit' | 'order' | 'close' | 'close_all' | 'cancel' | 'cancel_all';
  orderId: string;
  name: string;
  direction: OrderDirection;
  action: OrderAction;
  quantity: number;
  price: number;
  barIndex: number;
  timestamp: number;
  color: string;
  comment?: string;
}

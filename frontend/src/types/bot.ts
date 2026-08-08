import type { PositionInfo, FeedStatus } from './index';

export type BotStateT = 'Idle' | 'Starting' | 'Running' | 'Stopping' | 'Stopped' | 'Error';

export interface BotStatusSnapshot {
  state: BotStateT;
  strategyName: string;
  dex: string;
  walletPublicKey: string | null;
  startedAt: number | null;
  uptimeMs: number;
  balance: number;
  realizedPnl: number;
  unrealizedPnl: number;
  /** Truthful open positions from executor state (see PositionInfo). */
  positions: PositionInfo[];
  exposure: number;
  errors: Array<{ code: string; message: string; severity: string }>;
  lastTransition?: { from: BotStateT; to: BotStateT; reason: string; timestamp: number } | null;
  totalTrades?: number;
  winningTrades?: number;
  losingTrades?: number;
  winRate?: number;
  totalFees?: number;
  avgWin?: number;
  avgLoss?: number;
  profitFactor?: number;
  maxDrawdown?: number;
  avgLatency?: number;
  /** Running pairs from engine truth — preferred over disk config for the
   *  mini-chart's active pair. */
  pairs?: Array<{ symbol: string; timeframe: string }>;
  /** Current feed connectivity carried by the connect/state-change snapshot. */
  feedState?: FeedStatus;
}

export interface WalletInfo {
  hasWallet: boolean;
  publicKey?: string;
  usdcBalance?: number | null;
}

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

export interface ConfigValues {
  strategySource: string;
  dex: string;
  maxDailyLoss: number;
  timezone: string;
}
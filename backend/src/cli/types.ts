export type CliCommissionType = 'percent' | 'fixed' | 'per_contract' | 'per_order';
export type CliCommissionMethod = 'jupiter_ultra' | 'jupiter_manual';

export interface CliOptions {
  scriptPath: string;
  timeframe: string;
  /** Multi-timeframe support: comma-separated list of timeframes to backtest on. */
  timeframes?: string[];
  symbols: string[];
  daysBack: number;
  startDate?: string;
  endDate?: string;
  output?: string;
  initialCapital?: number;
  commission?: number;
  commissionType?: CliCommissionType;
  commissionMethod?: CliCommissionMethod;
  commissionMethodSettings?: Record<string, unknown>;
  slippage?: number;
  defaultQty?: number;
  pyramiding?: number;
  help: boolean;
  /** When true, allows using a non-Jupiter commission method. Without this flag,
   *  the CLI will refuse to run with fee models that don't match the live bot. */
  allowUnrealisticResults?: boolean;
}

export interface SymbolResult {
  symbol: string;
  status: 'completed' | 'failed';
  metrics?: SymbolMetrics;
  error?: string;
}

export interface SymbolMetrics {
  netProfit: number;
  netProfitPercent: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  winRate: number;
  sharpeRatio: number;
  totalTrades: number;
  buyHoldReturn: number;
}

export interface CrossPairSummary {
  avgNetProfitPercent: number;
  medianProfitFactor: number;
  coefficientOfVariation: number;
  overfittingRisk: 'LOW' | 'MODERATE' | 'HIGH';
  bestPair: string;
  worstPair: string;
  successfulSymbols: number;
  failedSymbols: number;
}

/** Results for a single timeframe within a multi-timeframe backtest run. */
export interface TimeframeResult {
  timeframe: string;
  dateRange: { start: string; end: string };
  symbols: SymbolResult[];
  crossPairSummary: CrossPairSummary;
}

export interface BacktestOutput {
  script: string;
  /** Overall date range across all timeframes. */
  dateRange: { start: string; end: string };
  /** Per-timeframe results. Always an array (one entry per timeframe tested). */
  timeframes: TimeframeResult[];
}

export const VALID_TIMEFRAMES = ['1', '3', '5', '15', '30', '60', '120', '240', 'D', 'W', 'M'];

export const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

const DAYS_BACK_BY_TIMEFRAME: Record<string, number> = {
  '1': 3,
  '3': 7,
  '5': 14,
  '15': 45,
  '30': 90,
  '60': 180,
  '120': 365,
  '240': 730,
  'D': 1825,
  'W': 1825,
  'M': 1825,
};

export function getDefaultDaysBack(timeframe: string): number {
  return DAYS_BACK_BY_TIMEFRAME[timeframe] ?? 90;
}

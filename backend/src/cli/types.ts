export interface CliOptions {
  scriptPath: string;
  timeframe: string;
  symbols: string[];
  daysBack: number;
  startDate?: string;
  endDate?: string;
  output?: string;
  initialCapital?: number;
  commission?: number;
  slippage?: number;
  defaultQty?: number;
  pyramiding?: number;
  help: boolean;
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

export interface BacktestOutput {
  script: string;
  timeframe: string;
  dateRange: { start: string; end: string };
  symbols: SymbolResult[];
  crossPairSummary: CrossPairSummary;
}

export const VALID_TIMEFRAMES = ['1', '3', '5', '15', '30', '60', '120', '240', 'D', 'W', 'M'];

export const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

export const DEFAULT_DAYS_BACK = 90;

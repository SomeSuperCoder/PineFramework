import type { ResolvedDateRange } from '../backtest-dates.js';
import type { StrategyConfig, BacktestWarning } from 'pine-framework';

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
  /** Pre-resolved UTC-midnight date range (ms) — the CLI resolves ONCE per
   *  timeframe (backtest-cli.ts) and hands it to the runner so fetch + display
   *  share the EXACT same window (design D6/M4). Absent for direct runner
   *  callers (tests/embedders), which resolve from raw options instead. */
  resolvedDateRange?: ResolvedDateRange;
  output?: string;
  /** `--export [dir]`: full backtest data export dir. '' = use default (.exports/). */
  exportDir?: string;
  initialCapital?: number;
  /** REQUIRED since the normalizer enforces the contract (commission-methods
   *  spec): the canonical id of the official commission method. The legacy
   *  commission/commissionType flags are GONE — no CLI path can express the
   *  dead 0-commission fee path. */
  commissionMethod?: CliCommissionMethod;
  commissionMethodSettings?: Record<string, unknown>;
  slippage?: number;
  defaultQty?: number;
  pyramiding?: number;
  /** `--max-bars <n>`: raise the engine's per-run bar-count cap (default 1500).
   *  Absent → legacy cap; the CLI enforces a positive integer in validateOptions. */
  maxBars?: number;
  help: boolean;
}

export interface SymbolResult {
  symbol: string;
  status: 'completed' | 'failed';
  metrics?: SymbolMetrics;
  error?: string;
  /** The UTC-midnight-aligned date range (ms) this symbol was backtested over —
   *  identical for every symbol in a multi-symbol run. The M6 CLI config
   *  summary reads the resolved range from here (the runner is the resolution
   *  owner; design D6 seam). */
  resolvedRange?: ResolvedDateRange;
  /** Typed diagnostics collected during this symbol's run (design D4) — engine
   *  records (fee-decision, baseline-applied, long-only-suppression) plus the
   *  CLI composition-root records (live-fee-cache / live-fee-failure from
   *  applyDexFee). Present only on completed symbols; the M6 summary renders
   *  these, quiet when none exist. */
  warnings?: BacktestWarning[];
  /** The engine's post-merge configuration — what ACTUALLY ran for this symbol
   *  (the M6 config-summary source; never re-derived from CLI flags). Present
   *  only on completed symbols. */
  effectiveConfig?: Readonly<StrategyConfig>;
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

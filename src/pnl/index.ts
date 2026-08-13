/**
 * src/pnl — the SINGLE SOURCE OF TRUTH for PnL + fee math.
 *
 * Consumers (live executor, adapters, backtest, stats) MUST derive every
 * realized-PnL and fee number through this API. Never inline price×qty
 * arithmetic elsewhere: it drifts from the anchor semantics below and
 * duplicates the fee-conversion border.
 *
 * Money is strings (`DecimalStr`); no floats. Fee conversion is
 * `feeToQuote` (fees.ts). Gross anchoring is `aggregateRealizedPnl`
 * (aggregate.ts) — read its JSDoc before wiring.
 */

// Public types.
export type {
  BacktestFeeModel,
  DecimalStr,
  FeeComponent,
  FeeKind,
  Fill,
  RealizedPnl,
  TokenPrice,
} from './types.js';

// Pure quote-unit arithmetic.
export { feeTotal, grossPnlLong, grossPnlShort, netPnl } from './core.js';

// The mint→quote border + modeled fees.
export { feeBreakdownToQuote, feeToQuote, modelFees, QUOTE_MINT, SOL_MINT_CODE } from './fees.js';

// The shared realized-PnL runner (anchor seam lives here).
export { aggregateRealizedPnl } from './aggregate.js';

// Canonical Jupiter fee tiers.
export { DEFAULT_JUPITER_FEE_BPS, jupiterFeeBpsForTier } from './fee-tiers.js';

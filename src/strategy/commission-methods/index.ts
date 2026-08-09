/**
 * commission-methods barrel — surviving jupiter fee-model surface.
 *
 * The per-fill jupiter CALCULATOR classes (jupiter-manual.ts / jupiter-ultra.ts)
 * were DELETED (D6/D7): backtest jupiter fees are now modeled once per round
 * trip through src/pnl (`buildBacktestFeeModel` + `modelFees`), and the
 * canonical Jupiter tier table lives in `src/pnl/fee-tiers.ts`. This barrel
 * re-exports the config + helpers those callers need.
 */

export { DEFAULT_DEX_FEE_BPS, DEFAULT_SOL_USD_PRICE } from './config.js';
export {
  getDexFeeBps,
  getSolUsdPrice,
  parsePairSymbol,
  detectJupiterPairCategory,
} from './utils.js';
export { buildBacktestFeeModel } from './backtest-model.js';

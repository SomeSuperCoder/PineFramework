/**
 * Build a `BacktestFeeModel` (src/pnl) from a jupiter commission-method config.
 *
 * This is the bridge that lets the backtest engine compute NET PnL through the
 * shared src/pnl module instead of the old per-fill jupiter calculators
 * (deleted — D6/D7). The module's `modelFees` is a ROUND-TRIP model (base fee
 * ×2 sigs per order, bps charged once on tradeValue), so this builder maps:
 *
 *   jupiter_manual → venueBps = dexFeeBps            (0% Jupiter platform fee)
 *   jupiter_ultra  → venueBps = dexFeeBps,
 *                    platformBps = Jupiter tier bps  (resolution order below)
 *   both           → priorityLamports from settings (if present),
 *                    baseLamports left to the module default (5_000/sig),
 *                    solUsdPrice from settings else DEFAULT_SOL_USD_PRICE.
 *
 * Jupiter tier resolution (preserves the old jupiter-ultra order):
 *   1. explicit pairCategory (non-custom) → canonical tier table
 *   2. auto-detect from trading symbol    → canonical tier table
 *   3. explicit custom `rate` (decimal fraction) → ×10000 → bps
 *   4. default tier (10 bps)
 * The canonical table lives in `src/pnl/fee-tiers.ts` — there is NO second copy.
 */

import type { BacktestFeeModel } from '../../pnl/index.js';
import { DEFAULT_JUPITER_FEE_BPS, jupiterFeeBpsForTier } from '../../pnl/index.js';
import type {
  CommissionMethodId,
  CommissionMethodSettings,
  JupiterUltraSettings,
} from './types.js';
import { detectJupiterPairCategory, getDexFeeBps, getSolUsdPrice } from './utils.js';

export function buildBacktestFeeModel(
  method: CommissionMethodId,
  settings: CommissionMethodSettings,
  symbol?: string,
): BacktestFeeModel {
  const s = (settings ?? {}) as Record<string, unknown>;

  const model: BacktestFeeModel = {
    tag: method,
    venueBps: String(getDexFeeBps(settings)),
    solUsdPrice: String(getSolUsdPrice(settings)),
  };

  // Priority fee per swap, in lamports — only when the config carries it
  // (settings did not expose it before; additive, not breaking).
  if (typeof s.priorityLamports === 'number') {
    model.priorityLamports = String(s.priorityLamports);
  }

  // jupiter_manual (Router path) charges 0% Jupiter platform fee — omit
  // platformBps so modelFees emits no PLATFORM component.
  if (method === 'jupiter_ultra') {
    model.platformBps = String(
      resolveJupiterPlatformBps(settings as JupiterUltraSettings | undefined, symbol),
    );
  }

  return model;
}

/** Resolve the Jupiter Ultra platform fee in bps (see module JSDoc for order). */
function resolveJupiterPlatformBps(
  settings: JupiterUltraSettings | undefined,
  symbol?: string,
): number {
  if (settings?.pairCategory && settings.pairCategory !== 'custom') {
    return jupiterFeeBpsForTier(settings.pairCategory);
  }
  if (symbol) {
    // detectJupiterPairCategory never returns 'custom' — always a named tier.
    return jupiterFeeBpsForTier(detectJupiterPairCategory(symbol));
  }
  if (typeof settings?.rate === 'number') {
    // `rate` is a decimal fraction (0.001 = 10 bps). bps are integers by
    // convention (src/pnl `bpsToDecimal`), so round away float artifacts.
    return Math.round(settings.rate * 10000);
  }
  return DEFAULT_JUPITER_FEE_BPS;
}

/**
 * Jupiter Ultra (Meta-Aggregator path) commission calculator.
 *
 * Total cost = DEX swap fee + Jupiter Ultra tiered fee + network fee.
 *
 * Jupiter fee tier resolution order:
 *   1. Explicit `pairCategory` in settings (manual override)
 *   2. Auto-detected from `context.symbol` (if provided)
 *   3. Explicit `rate` in settings (backward compatible fallback)
 *   4. Default rate of 0.001 (10 bps)
 *
 * See https://developers.jup.ag/docs/ultra/fees
 */

import type {
  TradeContext,
  CommissionConfig,
  JupiterUltraSettings,
  JupiterPairCategory,
  CommissionCalculator,
} from './types.js';
import {
  getDexFeeBps,
  calculateSolanaNetworkFee,
  detectJupiterPairCategory,
  JUPITER_FEE_BPS,
} from './utils.js';

class JupiterUltraCalculator implements CommissionCalculator {
  calculate(context: TradeContext, config: CommissionConfig): number {
    const settings = config.settings as JupiterUltraSettings | undefined;

    // 1. Compute DEX swap fee (always applies — Jupiter routes through DEXs)
    const dexFeeBps = getDexFeeBps(config.settings);
    const dexFee = context.tradeValue * (dexFeeBps * 0.0001);

    // 2. Compute Jupiter Ultra tiered fee
    let jupiterFee: number;

    if (settings?.pairCategory && settings.pairCategory !== 'custom') {
      const bps = JUPITER_FEE_BPS[settings.pairCategory] ?? 10;
      jupiterFee = context.tradeValue * (bps * 0.0001);
    } else if (context.symbol) {
      const category = detectJupiterPairCategory(context.symbol);
      // category is never 'custom' here because we're in the else branch
      const bps =
        JUPITER_FEE_BPS[
          category as Exclude<JupiterPairCategory, 'custom'>
        ];
      jupiterFee = context.tradeValue * (bps * 0.0001);
    } else {
      const rate = settings?.rate ?? 0.001;
      jupiterFee = context.tradeValue * rate;
    }

    // 3. Add Solana network fee
    return dexFee + jupiterFee + calculateSolanaNetworkFee(config.settings);
  }
}

export { JupiterUltraCalculator };

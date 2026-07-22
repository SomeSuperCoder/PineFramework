/**
 * Jupiter basic swap (Router path) commission calculator.
 *
 * Jupiter charges 0% commission on the Router path, but the swap still routes
 * through a DEX (Raydium, Orca, etc.) that charges a liquidity pool fee.
 * Total cost: DEX swap fee + Solana network fee.
 *
 * This is the correct model for a trading bot using the basic swap API.
 * See https://developers.jup.ag/docs/swap
 */

import type {
  TradeContext,
  CommissionConfig,
  CommissionCalculator,
} from './types.js';
import { getDexFeeBps, calculateSolanaNetworkFee } from './utils.js';

class JupiterManualCalculator implements CommissionCalculator {
  calculate(context: TradeContext, config: CommissionConfig): number {
    const dexFeeBps = getDexFeeBps(config.settings);
    const dexFee = context.tradeValue * (dexFeeBps * 0.0001);
    return dexFee + calculateSolanaNetworkFee(config.settings);
  }
}

export { JupiterManualCalculator };

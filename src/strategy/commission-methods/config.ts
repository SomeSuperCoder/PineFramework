/**
 * Backtest commission-model configuration — the SINGLE source for default fee
 * constants used by the backtest's jupiter fee models.
 *
 * D6/D7: the old per-fill jupiter calculators hard-coded a $150 SOL price
 * inside `utils.ts`. A fee-model INPUT like that has no business living next
 * to fee math, so it now lives here as a named constant the fee-model builder
 * (`backtest-model.ts`) reads. The canonical Jupiter fee TIER table itself
 * lives in `src/pnl/fee-tiers.ts` — this file only holds defaults that are NOT
 * Jupiter-schedule facts.
 */

/** Default SOL/USD price for lamport→quote fee conversion.
 *  ≈ $72.6 (2026-08-07) — rounded for stability; update here when the market
 *  moves materially. Per-backtest override: `settings.solPriceUsd`
 *  (0 disables the network fee). */
export const DEFAULT_SOL_USD_PRICE = 73;

/** Default DEX liquidity-pool swap fee in bps (Raydium standard). */
export const DEFAULT_DEX_FEE_BPS = 25;

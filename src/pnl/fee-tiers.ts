/**
 * Canonical Jupiter fee-tier table — the SINGLE source of truth for Jupiter
 * fee bps for the whole bot.
 *
 * Consolidates two previously-divergent tables:
 * - the backtest tier table (was `src/strategy/commission-methods/utils.ts`
 *   `JUPITER_FEE_BPS`): jupiter_ecosystem 0, pegged_asset 0, sol_stable 2,
 *   lst_stable 5, default 10, new_token 50;
 * - the live ultra adapter's flat 5 bps rate.
 *
 * D6 DECISION: the tiered values win (they are the more complete model). The
 * live flat rate is preserved as the NAMED tier `ultra_flat: 5` so the live
 * adapter can look up its own tier by name (`jupiterFeeBpsForTier('ultra_flat')`)
 * instead of hard-coding a rate. `sol_based` is retained for the live SOL-pair
 * mapping to the tiered schedule.
 *
 * No float math here — bps are integers; conversion to a decimal-string fee
 * happens in `src/pnl/fees.ts` via `bpsToDecimal`.
 */

export interface JupiterFeeTier {
  tier: string;
  feeBps: number;
}

/** Fee for a swap pair that matches no named tier (Jupiter's "default" rate). */
export const DEFAULT_JUPITER_FEE_BPS = 10;

export const JUPITER_FEE_TIERS: JupiterFeeTier[] = [
  { tier: 'jupiter_ecosystem', feeBps: 0 },
  { tier: 'pegged_asset', feeBps: 0 },
  { tier: 'sol_based', feeBps: 2 },
  { tier: 'sol_stable', feeBps: 2 },
  { tier: 'lst_stable', feeBps: 5 },
  { tier: 'ultra_flat', feeBps: 5 },
  { tier: 'default', feeBps: 10 },
  { tier: 'new_token', feeBps: 50 },
];

const TIER_INDEX = new Map<string, number>(JUPITER_FEE_TIERS.map((t) => [t.tier, t.feeBps]));

/**
 * Look up a tier's fee in bps. Unknown/custom tier names fall back to the
 * Jupiter `default` tier (10 bps) — a trade that can't be classified is
 * quoted at the standard rate, never fee-free.
 */
export function jupiterFeeBpsForTier(tier: string): number {
  return TIER_INDEX.get(tier) ?? DEFAULT_JUPITER_FEE_BPS;
}

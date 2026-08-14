/**
 * backtest-config.ts
 *
 * Single source of truth for the backtest "config glue":
 *   1. Mapping the canonical ExplicitBacktestOverride (backtest-contract.ts,
 *      produced by normalizeExplicitOverride) into a Partial<StrategyConfig>
 *      override (copy-only-present — never emit undefined keys, so a narrow
 *      input doesn't clobber StrategyConfig defaults).
 *   2. Applying a live DEX fee (Jupiter methods only) into the override's
 *      commissionMethodSettings.
 *   3. A CLI-only guard that refuses non-Jupiter commission methods unless
 *      explicitly allowed.
 *
 * This module is pure glue: it imports nothing from the existing callers and is
 * consumed by the API route, the CLI, and the auto-select runner. Do not edit
 * existing callers from here.
 */

import type { StrategyConfig, WarningSink } from 'pine-framework';
import type { ExplicitBacktestOverride } from './backtest-contract.js';
import { fetchDexFeeBps } from 'pine-framework/strategy/jupiter-fee-fetcher';
import { fetchSolPriceUsd } from './services/sol-price-fetcher.js';

/**
 * Build a Partial<StrategyConfig> from the canonical explicit override, copying
 * ONLY the keys that are present (not undefined). Omitting undefined keys is
 * load-bearing: a narrow override must NOT appear in the engine merge, which
 * preserves the engine's script-declared defaults. The legacy commission /
 * commissionType / currency fields are deliberately absent — the contract
 * removed them (no path can express the legacy fee path).
 */
export function buildBacktestConfigOverride(input: ExplicitBacktestOverride): Partial<StrategyConfig> {
  const override: Partial<StrategyConfig> = {};

  if (input.initialCapital !== undefined) override.initialCapital = input.initialCapital;
  if (input.commissionMethod !== undefined) override.commissionMethod = input.commissionMethod;
  if (input.commissionMethodSettings !== undefined) {
    // Contract settings are already the engine's narrow per-method union
    // (imported SSOT) — no boundary cast needed.
    override.commissionMethodSettings = input.commissionMethodSettings;
  }
  if (input.slippage !== undefined) override.slippage = input.slippage;
  if (input.slippageType !== undefined) override.slippageType = input.slippageType;
  if (input.defaultQty !== undefined) override.defaultQty = input.defaultQty;
  if (input.defaultQtyType !== undefined) override.defaultQtyType = input.defaultQtyType;
  if (input.pyramiding !== undefined) override.pyramiding = input.pyramiding;
  if (input.marginLong !== undefined) override.marginLong = input.marginLong;
  if (input.marginShort !== undefined) override.marginShort = input.marginShort;

  return override;
}

/**
 * DEX-fee freshness window (Wise Old Man ruling B, hatch b). Successfully
 * fetched live fees are cached for this long so consecutive CLI/API runs in
 * the same process agree without re-hitting the Jupiter API per symbol per
 * timeframe. NOTE: the underlying fetcher (pine-framework jupiter-fee-fetcher)
 * keeps its own session-scoped in-memory cache that does NOT expire within a
 * process, so after this TTL elapses we re-ask the fetcher, which may still
 * return its session value — this TTL is the caller-side call-frequency bound,
 * not a hard freshness ceiling (the fetcher's policy is out of this module's
 * lane).
 */
const DEX_FEE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CachedDexFee {
  dexFeeBps: number;
  fetchedAt: number;
}

const dexFeeCache = new Map<string, CachedDexFee>();

/**
 * Merge a live DEX fee (Jupiter commission methods only) into the override's
 * commissionMethodSettings.dexFeeBps AND inject the live SOL price
 * (solPriceUsd) for parity with the frontend `/dex-fee` panel.
 *
 * POLICY (Wise Old Man ruling B): a live-fee fetch failure THROWS for EVERY
 * producer — there is no flat fallback and no invented fee. A run that cannot
 * learn its true fee must not pretend it has one. Two hatches make THROW
 * practical:
 *   (a) a user-explicit dexFeeBps (present in commissionMethodSettings) bypasses
 *       the live fetch entirely — the caller's fee is authoritative; and
 *   (b) successfully fetched live fees are cached with a 10-minute TTL so
 *       sequential runs agree.
 *
 * The SOL price is orthogonal to the DEX fee, so it is resolved for ALL
 * commission methods (non-Jupiter safe: the early return still resolves it).
 * It is injected only when non-null — matching the panel contract that a SOL
 * price outage must never fail the backtest.
 *
 * `onWarning` (design D4 seam, optional): records the fee decisions this
 * function makes as typed diagnostics — `live-fee-cache` when a cached fee is
 * reused, `live-fee-failure` when the live fetch fails. Emissions NEVER change
 * the policy (a failure still THROWS); they only make the decision observable
 * to the run's WarningCollector. Absent → the decisions stay silent.
 */
export async function applyDexFee(
  symbol: string,
  override: Partial<StrategyConfig>,
  onWarning?: WarningSink,
): Promise<Partial<StrategyConfig>> {
  const cm = override.commissionMethod;
  if (cm !== 'jupiter_manual' && cm !== 'jupiter_ultra') {
    // Non-Jupiter: no DEX fee to fetch, but still resolve the live SOL price below.
    return injectSolPrice(override, await fetchSolPriceUsd());
  }

  // Hatch (a): user-explicit fee bypasses the live fetch entirely.
  const explicitDexFeeBps = override.commissionMethodSettings?.dexFeeBps;
  const hasExplicitFee =
    typeof explicitDexFeeBps === 'number' && Number.isFinite(explicitDexFeeBps);
  if (hasExplicitFee) {
    return injectSolPrice(override, await fetchSolPriceUsd());
  }

  // Hatch (b): serve a fresh cached fee when available — no network call.
  const cacheKey = symbol.toUpperCase();
  const cached = dexFeeCache.get(cacheKey);
  if (cached !== undefined && Date.now() - cached.fetchedAt < DEX_FEE_CACHE_TTL_MS) {
    // M6: record the cache reuse — the run's fee DID come from a cached value.
    onWarning?.({
      type: 'live-fee-cache',
      message: `Live DEX fee for ${symbol} served from cache`,
      context: {
        symbol,
        dexFeeBps: cached.dexFeeBps,
        fetchedAt: new Date(cached.fetchedAt).toISOString(),
      },
    });
    return injectSolPrice(withDexFeeBps(override, cached.dexFeeBps), await fetchSolPriceUsd());
  }

  // Live fetch. Failure THROWS — wrapped per-symbol so a multi-symbol batch
  // abort names exactly which symbol/fee failed (debuggability requirement).
  // M6: the throw is recorded as a typed diagnostic FIRST (the warning carries
  // the attempted fetch for the run record); a run that fails here simply has
  // no completed result to surface it from — keep it simple, no extra plumbing.
  let dexFeeBps: number;
  try {
    ({ dexFeeBps } = await fetchDexFeeBps(symbol));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onWarning?.({
      type: 'live-fee-failure',
      message: `Live DEX fee fetch failed for ${symbol}`,
      context: { symbol, error: msg },
    });
    throw new Error(`Failed to fetch live DEX fee for ${symbol}: ${msg}`);
  }
  dexFeeCache.set(cacheKey, { dexFeeBps, fetchedAt: Date.now() });

  return injectSolPrice(withDexFeeBps(override, dexFeeBps), await fetchSolPriceUsd());
}

/** Set commissionMethodSettings.dexFeeBps, preserving any other settings keys. */
function withDexFeeBps(
  override: Partial<StrategyConfig>,
  dexFeeBps: number,
): Partial<StrategyConfig> {
  return {
    ...override,
    commissionMethodSettings: {
      ...(override.commissionMethodSettings ?? {}),
      dexFeeBps,
    } as unknown as StrategyConfig['commissionMethodSettings'],
  };
}

/** Inject live SOL price into commissionMethodSettings when available (null = omit). */
function injectSolPrice(
  override: Partial<StrategyConfig>,
  solPriceUsd: number | null,
): Partial<StrategyConfig> {
  if (solPriceUsd === null) return override;
  return {
    ...override,
    commissionMethodSettings: {
      ...(override.commissionMethodSettings ?? {}),
      solPriceUsd,
    } as unknown as StrategyConfig['commissionMethodSettings'],
  };
}

/**
 * Guard: refuses to run with a non-Jupiter commission method unless
 * `allowNonJupiter` is true. The CLI ALWAYS passes false — the
 * `--allow-unrealistic-results` escape hatch was removed (reviewer F7); the
 * config normalizer rejects non-Jupiter methods regardless, so the guard is
 * defense-in-depth for direct callers. Retained (not deleted) because the
 * parity test suite covers it as part of the commission-method contract
 * surface — and the error message text is asserted there too (do not change).
 */
export function assertRealisticCommissionMethod(
  method: string | undefined,
  allowNonJupiter: boolean,
): void {
  if (allowNonJupiter) return;
  if (method === 'jupiter_ultra' || method === 'jupiter_manual') return;
  throw new Error(
    `Non-Jupiter commission method '${method}' requires --allow-unrealistic-results`,
  );
}

/**
 * backtest-config.ts
 *
 * Single source of truth for the backtest "config glue":
 *   1. Building a Partial<StrategyConfig> override from raw user/CLI input
 *      (copy-only-present — never emit undefined keys, so the CLI's narrow
 *      input doesn't clobber StrategyConfig defaults).
 *   2. Applying a live DEX fee (Jupiter methods only) into the override's
 *      commissionMethodSettings.
 *   3. A CLI-only guard that refuses non-Jupiter commission methods unless
 *      explicitly allowed.
 *
 * This module is pure glue: it imports nothing from the existing callers and is
 * consumed by the API route, the CLI, and the auto-select runner after they are
 * rewired (a separate task). Do not edit existing callers from here.
 */

import type { StrategyConfig } from 'pine-framework';
import { fetchDexFeeBps } from 'pine-framework/strategy/jupiter-fee-fetcher';
import { fetchSolPriceUsd } from './services/sol-price-fetcher.js';

/** Raw backtest config input accepted from the CLI / API request body. */
export interface BacktestConfigInput {
  initialCapital?: number;
  commission?: number;
  commissionType?: 'percent' | 'fixed' | 'per_contract' | 'per_order';
  commissionMethod?: 'jupiter_ultra' | 'jupiter_manual';
  commissionMethodSettings?: Record<string, unknown> | null;
  slippage?: number;
  slippageType?: 'percent' | 'ticks' | 'points';
  defaultQty?: number;
  defaultQtyType?: 'contracts' | 'percent_of_equity' | 'cash';
  pyramiding?: number;
  marginLong?: number;
  marginShort?: number;
}

/**
 * Build a Partial<StrategyConfig> from raw input, copying ONLY the keys that
 * are present (not undefined). Omitting undefined keys is load-bearing: the CLI
 * never supplies slippageType/marginLong/etc., so they must NOT appear, which
 * preserves the current CLI behavior (no clobbering of StrategyConfig defaults).
 */
export function buildBacktestConfigOverride(input: BacktestConfigInput): Partial<StrategyConfig> {
  const override: Partial<StrategyConfig> = {};

  if (input.initialCapital !== undefined) override.initialCapital = input.initialCapital;
  if (input.commission !== undefined) override.commission = input.commission;
  if (input.commissionType !== undefined) override.commissionType = input.commissionType;
  if (input.commissionMethod !== undefined) override.commissionMethod = input.commissionMethod;
  if (input.commissionMethodSettings !== undefined) {
    // Input uses a wide Record<string, unknown>; the engine's CommissionMethodSettings
    // is a narrow union. Cast structurally at the boundary.
    override.commissionMethodSettings =
      input.commissionMethodSettings as unknown as StrategyConfig['commissionMethodSettings'];
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

export interface ApplyDexFeeOptions {
  onFailure?: 'throw' | 'fallback';
  fallbackCommission?: number;
}

/**
 * Merge a live DEX fee (Jupiter commission methods only) into the override's
 * commissionMethodSettings.dexFeeBps AND inject the live SOL price
 * (solPriceUsd) for parity with the frontend `/dex-fee` panel.
 *
 * The SOL price is orthogonal to the DEX fee, so it is fetched for ALL
 * commission methods (non-Jupiter safe: the early return still resolves it).
 * It is injected only when non-null — matching the panel contract that a SOL
 * price outage must never fail the backtest. On DEX-fee failure: 'fallback'
 * replaces the fee with a flat commission; the default (and 'throw') re-throws.
 */
export async function applyDexFee(
  symbol: string,
  override: Partial<StrategyConfig>,
  opts?: ApplyDexFeeOptions,
): Promise<Partial<StrategyConfig>> {
  let result: Partial<StrategyConfig> = override;
  const cm = override.commissionMethod;
  if (cm !== 'jupiter_manual' && cm !== 'jupiter_ultra') {
    // Non-Jupiter: no DEX fee to fetch, but still resolve the live SOL price below.
    return injectSolPrice(result, await fetchSolPriceUsd());
  }

  try {
    const { dexFeeBps } = await fetchDexFeeBps(symbol);
    result = {
      ...override,
      commissionMethodSettings: {
        ...(override.commissionMethodSettings ?? {}),
        dexFeeBps,
      } as unknown as StrategyConfig['commissionMethodSettings'],
    };
  } catch (err) {
    if (opts?.onFailure === 'fallback') {
      result = {
        ...override,
        commission: opts.fallbackCommission ?? 0.1,
        commissionType: 'percent',
      };
    } else {
      throw err;
    }
  }

  return injectSolPrice(result, await fetchSolPriceUsd());
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
 * CLI-only guard: refuses to run with a non-Jupiter commission method unless
 * `allowNonJupiter` is true (the API route and auto-select runner pass true
 * because they always use Jupiter / realistic methods). The CLI passes false
 * and requires `--allow-unrealistic-results` to proceed with other methods.
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

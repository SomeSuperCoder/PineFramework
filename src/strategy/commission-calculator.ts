/**
 * Pluggable Commission Calculation Methods
 *
 * Thin orchestrator that composes the registry and public API from the
 * individual calculator implementations in commission-methods/.
 *
 * All type definitions, utilities, and calculator classes live in the
 * commission-methods/ directory and are re-exported here for backward
 * compatibility with existing import paths.
 *
 * The StrategyEngine delegates commission calculation to the active calculator
 * when one is configured via commissionMethod. Legacy commission_type /
 * commission_value from strategy() declarations remain supported as fallback.
 *
 * ── Jupiter Fee Reality (from official Jupiter docs) ──
 *
 * Jupiter is a **liquidity aggregator** — it routes swaps through DEXs
 * (Raydium, Orca, Meteora, etc.) that charge their own pool fees. The
 * total cost of a Jupiter swap consists of:
 *
 *   a) **DEX swap fee** — paid to the liquidity pool (always applies).
 *      Raydium: 25 bps, Orca: 1–30 bps, Meteora: dynamic.
 *      Configurable via `dexFeeBps` (default: 25 bps / 0.25%).
 *
 *   b) **Jupiter commission** — Jupiter's own markup.
 *      Router path (basic swap): 0% (Jupiter charges nothing).
 *      Ultra path (Meta-Aggregator): tiered 0–50 bps.
 *
 *   c) **Solana network fee** — paid to validators.
 *      ~5,000 lamports/sig × ~2 sigs = 0.00001 SOL ≈ $0.0015 at $150/SOL.
 *
 *   d) **Integrator fees** — OPTIONAL (0% by default), only if the
 *      integrator explicitly adds via `platformFeeBps`.
 *
 * ── Fee breakdown by swap path ──
 *
 * 1. Router path (basic swap) — `/build` + `/submit`
 *    - DEX swap fee  +  0% Jupiter commission  +  network fee
 *    - This is what a trading bot should use.
 *    - See https://developers.jup.ag/docs/swap
 *
 * 2. Meta-Aggregator path (Ultra) — `/order` + `/execute`
 *    - DEX swap fee  +  tiered Jupiter commission  +  network fee
 *    | Category                  | Jupiter bps | Total (DEX 25 + Jupiter) |
 *    |---------------------------|-------------|--------------------------|
 *    | Jupiter ecosystem tokens  |     0       |  25 bps (0.25%)         |
 *    | Pegged assets (Stable/LST)|     0       |  25 bps (0.25%)         |
 *    | SOL ↔ Stable              |     2       |  27 bps (0.27%)         |
 *    | LST ↔ Stable              |     5       |  30 bps (0.30%)         |
 *    | Everything else           |    10       |  35 bps (0.35%)         |
 *    | New tokens (<24h old)     |    50       |  75 bps (0.75%)         |
 *    - See https://developers.jup.ag/docs/ultra/fees
 */

// ---------------------------------------------------------------------------
// Re-export types for backward compatibility
// ---------------------------------------------------------------------------

export type {
  TradeContext,
  CommissionMethodId,
  PercentFixedSettings,
  PerOrderFixedSettings,
  JupiterPairCategory,
  JupiterUltraSettings,
  JupiterManualSettings,
  PercentCommissionSettings,
  CommissionMethodSettings,
  CommissionConfig,
  CommissionCalculator,
  CommissionMethodDescriptor,
  SettingsFieldType,
  SettingsFieldDescriptor,
} from './commission-methods/types.js';

// ---------------------------------------------------------------------------
// Re-export utilities for backward compatibility
// ---------------------------------------------------------------------------

export {
  parsePairSymbol,
  detectJupiterPairCategory,
} from './commission-methods/utils.js';

// ---------------------------------------------------------------------------
// Import calculator classes
// ---------------------------------------------------------------------------

import {
  PercentFixedCalculator,
  PercentCommissionCalculator,
} from './commission-methods/percent-fixed.js';
import { PerOrderFixedCalculator } from './commission-methods/per-order-fixed.js';
import { JupiterUltraCalculator } from './commission-methods/jupiter-ultra.js';
import { JupiterManualCalculator } from './commission-methods/jupiter-manual.js';
import { NoneCalculator } from './commission-methods/none.js';

import type {
  CommissionMethodId,
  CommissionCalculator,
  CommissionConfig,
  CommissionMethodDescriptor,
  CommissionMethodSettings,
  PercentFixedSettings,
  PercentCommissionSettings,
  PerOrderFixedSettings,
  JupiterUltraSettings,
  JupiterManualSettings,
  SettingsFieldDescriptor,
  TradeContext,
} from './commission-methods/types.js';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const CALCULATORS: Record<CommissionMethodId, CommissionCalculator> = {
  percent_fixed: new PercentFixedCalculator(),
  percent_commission: new PercentCommissionCalculator(),
  per_order_fixed: new PerOrderFixedCalculator(),
  jupiter_ultra: new JupiterUltraCalculator(),
  jupiter_manual: new JupiterManualCalculator(),
  none: new NoneCalculator(),
};

// ---------------------------------------------------------------------------
// Method descriptors (UI metadata)
// ---------------------------------------------------------------------------

const METHOD_DESCRIPTORS: CommissionMethodDescriptor[] = [
  {
    id: 'percent_fixed',
    name: 'Percent (Fixed)',
    description: 'Fixed percentage of trade value (fraction)',
    enforceLongOnly: false,
    defaultSettings: { rate: 0.001 } as PercentFixedSettings,
    settingsFields: [
      {
        key: 'rate',
        label: 'Rate',
        type: 'number',
        defaultValue: 0.001,
        min: 0,
        max: 1,
        step: 0.0001,
        tooltip: 'Commission rate as a fraction (e.g. 0.001 = 0.1%)',
      },
    ],
  },
  {
    id: 'percent_commission',
    name: 'Percent Commission (Legacy)',
    description:
      'Percentage commission matching legacy commissionType: percent (e.g. 0.1 = 0.1%)',
    enforceLongOnly: false,
    defaultSettings: { rate: 0.1 } as PercentCommissionSettings,
    settingsFields: [
      {
        key: 'rate',
        label: 'Rate (%)',
        type: 'number',
        defaultValue: 0.1,
        min: 0,
        max: 100,
        step: 0.01,
        tooltip: 'Commission as a percentage (e.g. 0.1 = 0.1%)',
      },
    ],
  },
  {
    id: 'per_order_fixed',
    name: 'Per Order (Fixed)',
    description: 'Fixed cash amount per order',
    enforceLongOnly: false,
    defaultSettings: { amount: 0 } as PerOrderFixedSettings,
    settingsFields: [
      {
        key: 'amount',
        label: 'Amount',
        type: 'number',
        defaultValue: 0,
        min: 0,
        step: 0.01,
        tooltip: 'Flat fee charged per order in account currency',
      },
    ],
  },
  {
    id: 'jupiter_ultra',
    name: 'Jupiter Ultra',
    description:
      'Jupiter Ultra (Meta-Aggregator) — tiered 0–50 bps Jupiter fee + DEX swap fee + network fee',
    enforceLongOnly: true,
    defaultSettings: {
      pairCategory: 'default',
      dexFeeBps: 25,
      solPriceUsd: 150,
    } as JupiterUltraSettings,
    settingsFields: [
      {
        key: 'pairCategory',
        label: 'Pair Category',
        type: 'select',
        defaultValue: 'default',
        options: [
          {
            value: 'jupiter_ecosystem',
            label:
              'Jupiter Ecosystem (0 bps) — SOL/Stable → JUP/JLP/jupSOL',
          },
          {
            value: 'pegged_asset',
            label: 'Pegged Assets (0 bps) — LST↔LST, Stable↔Stable',
          },
          { value: 'sol_stable', label: 'SOL↔Stable (2 bps)' },
          { value: 'lst_stable', label: 'LST↔Stable (5 bps)' },
          {
            value: 'default',
            label: 'Default (10 bps) — everything else',
          },
          {
            value: 'new_token',
            label: 'New Token (50 bps) — <24 hours old',
          },
          { value: 'custom', label: 'Custom Rate' },
        ],
        tooltip:
          "Fee tier based on the traded token pair, matching Jupiter Ultra's actual fee schedule.",
      },
      {
        key: 'rate',
        label: 'Custom Rate',
        type: 'number',
        defaultValue: 0.001,
        min: 0,
        max: 0.01,
        step: 0.0001,
        tooltip:
          'Custom fee rate (used when Pair Category is "Custom Rate").',
      },
      {
        key: 'dexFeeBps',
        label: 'DEX Swap Fee (bps)',
        type: 'number',
        defaultValue: 25,
        min: 0,
        max: 100,
        step: 1,
        tooltip:
          'Underlying DEX liquidity pool fee in bps. Raydium=25, Orca=1-30, Meteora=dynamic. This is paid on every swap regardless of Jupiter.',
      },
      {
        key: 'solPriceUsd',
        label: 'SOL Price (USD)',
        type: 'number',
        defaultValue: 150,
        min: 0,
        step: 0.01,
        tooltip:
          'SOL/USD price for converting Solana network fees (lamports → USD). 0 disables network fee.',
      },
    ],
  },
  {
    id: 'jupiter_manual',
    name: 'Jupiter (Basic Swap)',
    description:
      'Jupiter Router path — 0% Jupiter fee + DEX swap fee (default 25 bps) + network fee',
    enforceLongOnly: true,
    defaultSettings: {
      dexFeeBps: 25,
      solPriceUsd: 150,
    } as JupiterManualSettings,
    settingsFields: [
      {
        key: 'dexFeeBps',
        label: 'DEX Swap Fee (bps)',
        type: 'number',
        defaultValue: 25,
        min: 0,
        max: 100,
        step: 1,
        tooltip:
          'Underlying DEX liquidity pool fee in bps. Jupiter routes through Raydium (25 bps), Orca (1-30 bps), Meteora. This is paid on every swap.',
      },
      {
        key: 'solPriceUsd',
        label: 'SOL Price (USD)',
        type: 'number',
        defaultValue: 150,
        min: 0,
        step: 0.01,
        tooltip:
          'SOL/USD price for converting Solana network fees (lamports → USD). 0 disables network fee.',
      },
    ],
  },
  {
    id: 'none',
    name: 'None',
    description: 'No commission applied',
    enforceLongOnly: false,
    defaultSettings: null,
    settingsFields: [],
  },
];

const DESCRIPTOR_MAP = new Map<CommissionMethodId, CommissionMethodDescriptor>(
  METHOD_DESCRIPTORS.map((d) => [d.id, d]),
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the CommissionCalculator for the given method ID.
 * Returns undefined if the method ID is not recognized.
 */
export function getCommissionCalculator(
  methodId: CommissionMethodId,
): CommissionCalculator | undefined {
  return CALCULATORS[methodId];
}

/**
 * Get the descriptor for the given method ID.
 * Returns undefined if the method ID is not recognized.
 */
export function getCommissionMethodDescriptor(
  methodId: CommissionMethodId,
): CommissionMethodDescriptor | undefined {
  return DESCRIPTOR_MAP.get(methodId);
}

/** Get descriptors for all built-in commission methods. */
export function getAllCommissionMethodDescriptors(): CommissionMethodDescriptor[] {
  return [...METHOD_DESCRIPTORS];
}

/**
 * Check whether the given method enforces long-only trading.
 * Returns false for unknown method IDs.
 */
export function isLongOnlyEnforced(methodId: CommissionMethodId): boolean {
  return DESCRIPTOR_MAP.get(methodId)?.enforceLongOnly ?? false;
}

/**
 * Compute commission using the pluggable system.
 * This is the main entry point that the StrategyEngine should call
 * when a commissionMethod is configured. Falls back to 0 for unknown methods.
 */
export function computeCommission(
  context: TradeContext,
  config: CommissionConfig,
): number {
  const calculator = CALCULATORS[config.method];
  if (!calculator) return 0;
  return calculator.calculate(context, config);
}

/**
 * Build a TradeContext from order fill data.
 * Used by the StrategyEngine when commission is computed at fill time
 * (before a full Trade object exists).
 */
export function buildTradeContextFromFill(params: {
  direction: 'long' | 'short';
  fillPrice: number;
  quantity: number;
  /** True for an entry fill (opening a position), false for exit. */
  isEntry: boolean;
  /** Trading pair symbol for Jupiter tier auto-detection. */
  symbol?: string;
}): TradeContext {
  const tradeValue = Math.abs(params.fillPrice * params.quantity);
  return {
    direction: params.direction,
    entryPrice: params.isEntry ? params.fillPrice : 0,
    exitPrice: params.isEntry ? 0 : params.fillPrice,
    quantity: params.quantity,
    tradeValue,
    isEntry: params.isEntry,
    symbol: params.symbol,
  };
}

/**
 * Build a TradeContext from a completed trade's data.
 * Used when commission is recomputed at trade close.
 */
export function buildTradeContextFromTrade(params: {
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  /** Trading pair symbol for Jupiter tier auto-detection. */
  symbol?: string;
}): TradeContext {
  const tradeValue = Math.abs(params.entryPrice * params.quantity);
  return {
    direction: params.direction,
    entryPrice: params.entryPrice,
    exitPrice: params.exitPrice,
    quantity: params.quantity,
    tradeValue,
    symbol: params.symbol,
  };
}

/**
 * Pluggable Commission Calculation Methods
 *
 * Provides a CommissionCalculator interface and built-in implementations for
 * computing trading commission during backtests. Each method encapsulates
 * a distinct fee model (percentage-based, per-order, Jupiter DEX fees, etc.).
 *
 * The StrategyEngine delegates commission calculation to the active calculator
 * when one is configured via commissionMethod. Legacy commission_type /
 * commission_value from strategy() declarations remain supported as fallback.
 *
 * ── Jupiter Ultra Fee Tiers (from official Jupiter docs) ──
 * | Category                  | Fee (bps) | Fee (%) |
 * |---------------------------|-----------|---------|
 * | Jupiter ecosystem tokens  |     0     |   0%    |
 * | Pegged assets (Stable/LST)|     0     |   0%    |
 * | SOL ↔ Stable              |     2     |  0.02%  |
 * | LST ↔ Stable              |     5     |  0.05%  |
 * | Everything else           |    10     |  0.1%   |
 * | New tokens (<24h old)     |    50     |  0.5%   |
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal trade data needed for commission calculation. */
export interface TradeContext {
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  tradeValue: number; // abs(entryPrice * quantity) or abs(exitPrice * quantity)
}

/** Identifies a built-in commission calculation method. */
export type CommissionMethodId =
  | 'percent_fixed'
  | 'percent_commission'
  | 'per_order_fixed'
  | 'jupiter_ultra'
  | 'jupiter_manual'
  | 'none';

/** Settings for the percent_fixed method. */
export interface PercentFixedSettings {
  /** Commission rate as a fraction (e.g. 0.001 = 0.1%). */
  rate: number;
}

/** Settings for the per_order_fixed method. */
export interface PerOrderFixedSettings {
  /** Flat cash amount charged per order. */
  amount: number;
}

/**
 * Jupiter Ultra fee tier, matched to the actual Jupiter DEX fee schedule.
 *
 * See https://docs.jup.ag/user-docs/trade/swap/fees and
 * https://developers.jup.ag/docs/ultra/fees for up-to-date fee details.
 */
export type JupiterPairCategory =
  /** Buying Jupiter ecosystem tokens: SOL/Stable → JUP/JLP/jupSOL (0 bps). */
  | 'jupiter_ecosystem'
  /** Pegged asset pairs: LST↔LST, Stable↔Stable (0 bps). */
  | 'pegged_asset'
  /** SOL ↔ Stablecoin (2 bps). */
  | 'sol_stable'
  /** Liquid Staking Token ↔ Stablecoin (5 bps). */
  | 'lst_stable'
  /** Default: all other token pairs not in a special tier (10 bps). */
  | 'default'
  /** Tokens less than 24 hours old on Solana (50 bps). */
  | 'new_token'
  /** Use a custom rate via the `rate` field instead of a preset tier. */
  | 'custom';

/** Settings for the jupiter_ultra method. */
export interface JupiterUltraSettings {
  /**
   * Fee tier based on the traded token pair.
   * Maps to Jupiter Ultra's actual per-pair fee schedule.
   * When set to a named tier, `rate` is ignored and the tier's bps is used.
   * When set to 'custom' or omitted, `rate` is used (backward compatible).
   * Default: 'default' (10 bps).
   */
  pairCategory?: JupiterPairCategory;
  /**
   * Custom rate override as a decimal fraction (e.g. 0.001 = 0.1%).
   * Only used when pairCategory is 'custom' or when pairCategory is unset
   * (backward compatibility with existing configs).
   */
  rate?: number;
}

/** Maps each Jupiter pair category to its fee in basis points (1 bps = 0.01%). */
export const JUPITER_FEE_BPS: Record<Exclude<JupiterPairCategory, 'custom'>, number> = {
  jupiter_ecosystem: 0,    // 0%
  pegged_asset: 0,         // 0%
  sol_stable: 2,           // 0.02%
  lst_stable: 5,           // 0.05%
  default: 10,             // 0.1%
  new_token: 50,           // 0.5%
};

/** Settings for the percent_commission method (legacy-compatible). */
export interface PercentCommissionSettings {
  /** Commission as a percentage (e.g., 0.1 = 0.1%), matching legacy commissionType: 'percent'. */
  rate: number;
}

/** Union of all method-specific settings. */
export type CommissionMethodSettings =
  | PercentFixedSettings
  | PercentCommissionSettings
  | PerOrderFixedSettings
  | JupiterUltraSettings
  | Record<string, never>
  | null;

/** Configuration passed to a CommissionCalculator. */
export interface CommissionConfig {
  method: CommissionMethodId;
  settings: CommissionMethodSettings;
}

/** Metadata describing a commission method for UI rendering. */
export interface CommissionMethodDescriptor {
  id: CommissionMethodId;
  name: string;
  description: string;
  enforceLongOnly: boolean;
  defaultSettings: CommissionMethodSettings;
  /** Schema for settings fields the UI should render. */
  settingsFields: SettingsFieldDescriptor[];
}

/** Supported UI field types for method-specific settings. */
export type SettingsFieldType = 'number' | 'select';

/** Describes a single settings field for the UI. */
export interface SettingsFieldDescriptor {
  key: string;
  label: string;
  type: SettingsFieldType;
  defaultValue: number | string;
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
  /** Options for 'select' type fields. */
  options?: Array<{ value: string; label: string }>;
}

// ---------------------------------------------------------------------------
// CommissionCalculator interface
// ---------------------------------------------------------------------------

/**
 * Computes the commission charged for a single trade or order fill.
 *
 * Implementations must be pure functions of the context and config —
 * no internal state that persists across calls.
 */
export interface CommissionCalculator {
  /** Compute the commission amount in account currency. */
  calculate(context: TradeContext, config: CommissionConfig): number;
}

// ---------------------------------------------------------------------------
// Built-in method implementations
// ---------------------------------------------------------------------------

class PercentFixedCalculator implements CommissionCalculator {
  calculate(context: TradeContext, config: CommissionConfig): number {
    const rate = (config.settings as PercentFixedSettings)?.rate ?? 0;
    return context.tradeValue * rate;
  }
}

class PercentCommissionCalculator implements CommissionCalculator {
  /**
   * Legacy-compatible commission calculator.
   * Takes `commission` as a percentage (e.g., 0.1 = 0.1%), matching the legacy `commission` + `commissionType: 'percent'` behavior.
   * This provides a drop-in replacement for legacy commission configuration.
   */
  calculate(context: TradeContext, config: CommissionConfig): number {
    const settings = config.settings as PercentCommissionSettings | undefined;
    const rate = settings?.rate ?? 0;
    return context.tradeValue * (rate / 100);
  }
}

class PerOrderFixedCalculator implements CommissionCalculator {
  calculate(_context: TradeContext, config: CommissionConfig): number {
    return (config.settings as PerOrderFixedSettings)?.amount ?? 0;
  }
}

class JupiterUltraCalculator implements CommissionCalculator {
  /**
   * Models Jupiter DEX Ultra Mode swap fees using the actual tiered fee
   * schedule published by Jupiter:
   *   - Jupiter ecosystem / pegged assets: 0 bps
   *   - SOL ↔ Stable:                      2 bps
   *   - LST ↔ Stable:                      5 bps
   *   - Everything else (default):         10 bps
   *   - New tokens (<24h):                 50 bps
   *
   * Backward compatible: if pairCategory is unset, falls back to `rate`.
   * See https://developers.jup.ag/docs/ultra/fees
   */
  calculate(context: TradeContext, config: CommissionConfig): number {
    const settings = config.settings as JupiterUltraSettings | undefined;

    // If a named tier is explicitly set (and it's not 'custom'), use its bps.
    if (settings?.pairCategory && settings.pairCategory !== 'custom') {
      const bps = JUPITER_FEE_BPS[settings.pairCategory] ?? 10; // default fallback
      return context.tradeValue * (bps / 10000);
    }

    // Fallback: use explicit rate (backward compatible with old configs).
    const rate = settings?.rate ?? 0.001;
    return context.tradeValue * rate;
  }
}

class JupiterManualCalculator implements CommissionCalculator {
  /** Jupiter Market Swap (manual routing) charges zero commission. */
  calculate(_context: TradeContext, _config: CommissionConfig): number {
    return 0;
  }
}

class NoneCalculator implements CommissionCalculator {
  calculate(_context: TradeContext, _config: CommissionConfig): number {
    return 0;
  }
}

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
    description: 'Percentage commission matching legacy commissionType: percent (e.g. 0.1 = 0.1%)',
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
    description: 'Jupiter DEX Ultra Mode swap fees with actual per-pair tiered fee schedule',
    enforceLongOnly: true,
    defaultSettings: { pairCategory: 'default' } as JupiterUltraSettings,
    settingsFields: [
      {
        key: 'pairCategory',
        label: 'Pair Category',
        type: 'select',
        defaultValue: 'default',
        options: [
          { value: 'jupiter_ecosystem', label: 'Jupiter Ecosystem (0 bps) — SOL/Stable → JUP/JLP/jupSOL' },
          { value: 'pegged_asset', label: 'Pegged Assets (0 bps) — LST↔LST, Stable↔Stable' },
          { value: 'sol_stable', label: 'SOL↔Stable (2 bps)' },
          { value: 'lst_stable', label: 'LST↔Stable (5 bps)' },
          { value: 'default', label: 'Default (10 bps) — everything else' },
          { value: 'new_token', label: 'New Token (50 bps) — <24 hours old' },
          { value: 'custom', label: 'Custom Rate' },
        ],
        tooltip: 'Fee tier based on the traded token pair, matching Jupiter Ultra\'s actual fee schedule.',
      },
      {
        key: 'rate',
        label: 'Custom Rate',
        type: 'number',
        defaultValue: 0.001,
        min: 0,
        max: 0.01,
        step: 0.0001,
        tooltip: 'Custom fee rate (used when Pair Category is "Custom Rate").',
      },
    ],
  },
  {
    id: 'jupiter_manual',
    name: 'Jupiter Manual',
    description: 'Jupiter DEX Market Swap (manual routing) — zero commission',
    enforceLongOnly: true,
    defaultSettings: null,
    settingsFields: [],
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
 *
 * This is the main entry point that the StrategyEngine should call
 * when a commissionMethod is configured. Falls back to 0 for unknown methods.
 */
export function computeCommission(context: TradeContext, config: CommissionConfig): number {
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
}): TradeContext {
  const tradeValue = Math.abs(params.fillPrice * params.quantity);
  return {
    direction: params.direction,
    entryPrice: params.fillPrice,
    exitPrice: params.fillPrice,
    quantity: params.quantity,
    tradeValue,
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
}): TradeContext {
  const tradeValue = Math.abs(params.entryPrice * params.quantity);
  return {
    direction: params.direction,
    entryPrice: params.entryPrice,
    exitPrice: params.exitPrice,
    quantity: params.quantity,
    tradeValue,
  };
}

/**
 * Shared type definitions for pluggable commission calculation methods.
 * Extracted from commission-calculator.ts for reusability.
 */

/** Minimal trade data needed for commission calculation. */
export interface TradeContext {
  direction: 'long' | 'short';
  /** Price at which the position was entered (0 for exit-only fills). */
  entryPrice: number;
  /** Price at which the position was exited (0 for entry-only fills). */
  exitPrice: number;
  quantity: number;
  /** Absolute value of (current fillPrice * quantity) for this fill. */
  tradeValue: number;
  /** True if this fill is opening (entry), false if closing (exit). */
  isEntry: boolean;
  /** Trading pair symbol for Jupiter tier auto-detection. */
  symbol?: string;
}

/** Identifies a built-in commission calculation method. */
export type CommissionMethodId =
  | 'jupiter_ultra'
  | 'jupiter_manual';

/**
 * Jupiter Ultra fee tier, matched to the actual Jupiter DEX fee schedule.
 * See https://docs.jup.ag/user-docs/trade/swap/fees
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
  pairCategory?: JupiterPairCategory;
  /** Custom rate override (only used when pairCategory is 'custom' or unset). */
  rate?: number;
  /** SOL/USD price for network fee conversion. 0 disables network fee. */
  solPriceUsd?: number;
  /** DEX liquidity pool swap fee in bps. Default: 25 (Raydium standard). */
  dexFeeBps?: number;
}

/** Settings for the jupiter_manual (basic swap) method. */
export interface JupiterManualSettings {
  solPriceUsd?: number;
  dexFeeBps?: number;
}

/** Union of method-specific settings — only Jupiter methods remain. */
export type CommissionMethodSettings =
  | JupiterUltraSettings
  | JupiterManualSettings
  | Record<string, never>
  | null;

/** Configuration passed to a CommissionCalculator. */
export interface CommissionConfig {
  method: CommissionMethodId;
  settings: CommissionMethodSettings;
}

/**
 * Computes the commission charged for a single trade or order fill.
 * Implementations must be pure functions — no internal state across calls.
 */
export interface CommissionCalculator {
  calculate(context: TradeContext, config: CommissionConfig): number;
}

/** Metadata describing a commission method for UI rendering. */
export interface CommissionMethodDescriptor {
  id: CommissionMethodId;
  name: string;
  description: string;
  enforceLongOnly: boolean;
  defaultSettings: CommissionMethodSettings;
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
  options?: Array<{ value: string; label: string }>;
}

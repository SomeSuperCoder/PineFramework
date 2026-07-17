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

/** Settings for the jupiter_ultra method. */
export interface JupiterUltraSettings {
  /**
   * Representative commission rate for backtesting.
   * Real Jupiter Ultra fees vary by pair volatility and token type (0–0.5%).
   * Default: 0.001 (~10 bps).
   */
  rate: number;
}

/** Union of all method-specific settings. */
export type CommissionMethodSettings =
  | PercentFixedSettings
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

/** Describes a single settings field for the UI. */
export interface SettingsFieldDescriptor {
  key: string;
  label: string;
  type: 'number';
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
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

class PerOrderFixedCalculator implements CommissionCalculator {
  calculate(_context: TradeContext, config: CommissionConfig): number {
    return (config.settings as PerOrderFixedSettings)?.amount ?? 0;
  }
}

class JupiterUltraCalculator implements CommissionCalculator {
  /**
   * Models Jupiter DEX Ultra Mode swap fees.
   *
   * Real fees vary by pair volatility and token type (typically 0–0.5%,
   * ~5–10 bps typical). For backtesting, a representative fixed rate is used.
   * The fee amount is determined at quote time by the Jupiter backend.
   */
  calculate(context: TradeContext, config: CommissionConfig): number {
    const rate = (config.settings as JupiterUltraSettings)?.rate ?? 0.001;
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
    description: 'Fixed percentage of trade value',
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
    description: 'Jupiter DEX Ultra Mode swap fees (~0–0.5%, ~10 bps typical)',
    enforceLongOnly: true,
    defaultSettings: { rate: 0.001 } as JupiterUltraSettings,
    settingsFields: [
      {
        key: 'rate',
        label: 'Rate',
        type: 'number',
        defaultValue: 0.001,
        min: 0,
        max: 0.01,
        step: 0.0001,
        tooltip:
          'Representative fee rate for backtesting. Real Jupiter Ultra fees vary by pair (0–0.5%).',
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

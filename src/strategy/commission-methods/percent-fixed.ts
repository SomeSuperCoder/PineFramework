/**
 * Percent-based commission calculators.
 *
 * Two variants:
 *   - PercentFixedCalculator: rate as a fraction (0.001 = 0.1%)
 *   - PercentCommissionCalculator (legacy): rate as a percentage (0.1 = 0.1%)
 */

import type {
  TradeContext,
  CommissionConfig,
  PercentFixedSettings,
  PercentCommissionSettings,
  CommissionCalculator,
} from './types.js';

class PercentFixedCalculator implements CommissionCalculator {
  calculate(context: TradeContext, config: CommissionConfig): number {
    const rate = (config.settings as PercentFixedSettings)?.rate ?? 0;
    return context.tradeValue * rate;
  }
}

class PercentCommissionCalculator implements CommissionCalculator {
  /**
   * Legacy-compatible commission calculator.
   * Takes `commission` as a percentage (e.g., 0.1 = 0.1%), matching the legacy
   * `commission` + `commissionType: 'percent'` behavior.
   */
  calculate(context: TradeContext, config: CommissionConfig): number {
    const settings = config.settings as PercentCommissionSettings | undefined;
    const rate = settings?.rate ?? 0;
    return context.tradeValue * (rate / 100);
  }
}

export { PercentFixedCalculator, PercentCommissionCalculator };

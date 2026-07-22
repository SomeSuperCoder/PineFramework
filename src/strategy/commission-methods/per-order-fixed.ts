/**
 * Per-order fixed commission calculator.
 * Charges a flat cash amount per order, regardless of trade size.
 */

import type {
  TradeContext,
  CommissionConfig,
  PerOrderFixedSettings,
  CommissionCalculator,
} from './types.js';

class PerOrderFixedCalculator implements CommissionCalculator {
  calculate(_context: TradeContext, config: CommissionConfig): number {
    return (config.settings as PerOrderFixedSettings)?.amount ?? 0;
  }
}

export { PerOrderFixedCalculator };

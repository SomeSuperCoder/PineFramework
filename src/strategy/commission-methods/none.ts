/**
 * No-commission calculator.
 * Always returns 0 — no commission charged.
 */

import type {
  TradeContext,
  CommissionConfig,
  CommissionCalculator,
} from './types.js';

class NoneCalculator implements CommissionCalculator {
  calculate(_context: TradeContext, _config: CommissionConfig): number {
    return 0;
  }
}

export { NoneCalculator };

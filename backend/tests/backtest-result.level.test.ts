/**
 * buildDecisionWarnings — fee-decision `level` semantics (warning-level spec).
 *
 * Locks the three decision variants emitted for the fee-decision diagnostic:
 *   (a) user-explicit method stayed in effect  → level 'info'  (confirmation)
 *   (b) user-requested method was overridden   → level 'warning' (divergence)
 *   (c) method was auto-resolved (no explicit) → level 'warning' (divergence)
 *
 * Absent-level semantics live on the BacktestWarning type (src/warning-collector.ts,
 * absent = 'warning'); this suite locks the PRODUCER-side emission.
 */

import { describe, it, expect } from 'vitest';
import { buildDecisionWarnings } from '../src/backtest-result.js';
import type {
  EffectiveBacktestConfig,
  ExplicitBacktestOverride,
} from '../src/backtest-contract.js';

/** Minimal post-merge config — every required StrategyConfig field + commission fields. */
function makeEffective(
  commissionMethod: 'jupiter_ultra' | 'jupiter_manual',
  commissionMethodSettings?: EffectiveBacktestConfig['commissionMethodSettings'],
): EffectiveBacktestConfig {
  return {
    initialCapital: 10000,
    commission: 0,
    slippage: 0,
    commissionType: 'percent',
    slippageType: 'ticks',
    defaultQty: 100,
    defaultQtyType: 'percent_of_equity',
    pyramiding: 0,
    calcOnOrderFills: true,
    calcOnEveryTick: false,
    processOrdersOnClose: false,
    maxBarsBack: 0,
    marginLong: 0,
    marginShort: 0,
    currency: 'USD',
    marketFillPrice: 'open',
    commissionMethod,
    commissionMethodSettings,
  };
}

const MANUAL_SETTINGS = { solPriceUsd: 180.5, dexFeeBps: 25 };
const ULTRA_SETTINGS = { pairCategory: 'default', solPriceUsd: 180.5, dexFeeBps: 25 };

describe('buildDecisionWarnings (fee-decision level semantics)', () => {
  it('emits level "info" when the user-explicit method stayed in effect (confirms the choice)', () => {
    const explicit: ExplicitBacktestOverride = {
      commissionMethod: 'jupiter_manual',
      commissionMethodSettings: MANUAL_SETTINGS,
    };
    const warnings = buildDecisionWarnings(
      explicit,
      makeEffective('jupiter_manual', MANUAL_SETTINGS),
    );

    expect(warnings).toHaveLength(1);
    const w = warnings[0]!;
    expect(w.type).toBe('fee-decision');
    expect(w.level).toBe('info');
    expect(w.message).toBe("Commission method 'jupiter_manual' (user-explicit)");
    expect(w.context).toMatchObject({
      explicitMethod: 'jupiter_manual',
      effectiveMethod: 'jupiter_manual',
      effectiveSettings: MANUAL_SETTINGS,
    });
  });

  it('emits level "warning" when the user-requested method was overridden', () => {
    const explicit: ExplicitBacktestOverride = {
      commissionMethod: 'jupiter_manual',
      commissionMethodSettings: MANUAL_SETTINGS,
    };
    const warnings = buildDecisionWarnings(
      explicit,
      makeEffective('jupiter_ultra', ULTRA_SETTINGS),
    );

    expect(warnings).toHaveLength(1);
    const w = warnings[0]!;
    expect(w.type).toBe('fee-decision');
    expect(w.level).toBe('warning');
    expect(w.message).toBe(
      "Commission method 'jupiter_ultra' (user-requested 'jupiter_manual' overridden)",
    );
    expect(w.context).toMatchObject({
      explicitMethod: 'jupiter_manual',
      effectiveMethod: 'jupiter_ultra',
    });
  });

  it('emits level "warning" when the method was resolved (no explicit request)', () => {
    const warnings = buildDecisionWarnings(null, makeEffective('jupiter_ultra', ULTRA_SETTINGS));

    expect(warnings).toHaveLength(1);
    const w = warnings[0]!;
    expect(w.type).toBe('fee-decision');
    expect(w.level).toBe('warning');
    expect(w.message).toBe("Commission method 'jupiter_ultra' (resolved)");
    expect(w.context).toMatchObject({
      explicitMethod: null,
      effectiveMethod: 'jupiter_ultra',
      effectiveSettings: ULTRA_SETTINGS,
    });
  });
});

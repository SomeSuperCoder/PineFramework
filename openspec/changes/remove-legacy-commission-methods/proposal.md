## Why

The commission calculation system has a two-tier architecture — legacy and pluggable — that has been stable for months. The legacy `percent_commission` method (`PercentCommissionCalculator`) was kept for backward compatibility during the transition but is no longer referenced by any user-facing code. Additionally, the `percent_fixed` and `per_order_fixed` methods are generic fee models that don't reflect the actual cost structure of Solana DEX trading. Removing them eliminates dead code, reduces the API surface, and simplifies documentation and the settings UI.

## What Changes

- **Remove** `percent_commission` method ID, `PercentCommissionCalculator` class, and `PercentCommissionSettings` type — the legacy percentage commission that duplicated `commissionType: 'percent'` behavior
- **Remove** `percent_fixed` method ID, `PercentFixedCalculator` class, and `PercentFixedSettings` type — generic percentage model not relevant to Solana trading
- **Remove** `per_order_fixed` method ID, `PerOrderFixedCalculator` class, and `PerOrderFixedSettings` type — generic fixed-fee model not relevant to Solana trading
- **Remove** `none` method ID, `NoneCalculator` class — zero-commission not needed; if users want no commission they simply don't set a method
- **Keep** `jupiter_ultra` and `jupiter_manual` — the two Solana DEX-accurate commission models
- Clean up registries (`CALCULATORS`, `METHOD_DESCRIPTORS`, `CommissionMethodSettings` union, `CommissionMethodId` union)
- Update frontend `BacktestCommissionSettings` to remove UI for deleted methods
- Update CLI backtest tool to remove deleted method options
- Update all tests to only cover kept methods
- Remove the source files `percent-fixed.ts`, `per-order-fixed.ts`, and `none.ts`

**BREAKING**: Consumers that reference `'percent_fixed'`, `'percent_commission'`, `'per_order_fixed'`, or `'none'` as a `CommissionMethodId` will need to migrate. The Jupiter methods already subsume these use cases for realistic Solana backtesting. Users who want zero commission can simply omit the `commissionMethod` config and the legacy fallback path handles it.

## Capabilities

### New Capabilities

None — this change removes functionality, it doesn't add any.

### Modified Capabilities

None — the existing specs (`strategy-backtest-engine`, `cli-backtest-tool`) only mention "commission" generically and do not enumerate specific method IDs. No spec-level requirements change.

## Impact

- **Removed source files**: `src/strategy/commission-methods/percent-fixed.ts`, `src/strategy/commission-methods/per-order-fixed.ts`, `src/strategy/commission-methods/none.ts`
- **Modified files**: `src/strategy/commission-methods/types.ts`, `src/strategy/commission-calculator.ts`, `src/strategy/commission-methods/index.ts`
- **Frontend**: `frontend/src/components/BacktestCommissionSettings.tsx`, `frontend/src/types/index.ts`
- **CLI**: `backend/src/cli/types.ts`, `backend/src/cli/backtest-cli.ts`
- **Tests**: `tests/strategy/commission-calculator.test.ts`, `tests/strategy/backtest-commission-methods.test.ts`
- **Strategy exports**: `src/strategy/index.ts` (re-exports)

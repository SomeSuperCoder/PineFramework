## 1. Remove removed types from `types.ts`

- [x] 1.1 Reduce `CommissionMethodId` union to only `'jupiter_ultra' | 'jupiter_manual'`
- [ ] 1.2 Remove `PercentFixedSettings` interface
- [ ] 1.3 Remove `PerOrderFixedSettings` interface
- [ ] 1.4 Remove `PercentCommissionSettings` interface
- [ ] 1.5 Remove `PercentFixedSettings`, `PercentCommissionSettings`, and `PerOrderFixedSettings` from the `CommissionMethodSettings` union type (it no longer needs a union at all — can become `Record<string, unknown> | null`)

## 2. Remove removed calculator source files

- [ ] 2.1 Delete `src/strategy/commission-methods/percent-fixed.ts`
- [ ] 2.2 Delete `src/strategy/commission-methods/per-order-fixed.ts`
- [ ] 2.3 Delete `src/strategy/commission-methods/none.ts`

## 3. Update the registry and public API in `commission-calculator.ts`

- [ ] 3.1 Remove imports of `PercentFixedCalculator`, `PercentCommissionCalculator`, `PerOrderFixedCalculator`, `NoneCalculator` and their source file imports
- [ ] 3.2 Remove type imports for `PercentFixedSettings`, `PercentCommissionSettings`, `PerOrderFixedSettings`
- [ ] 3.3 Remove `percent_fixed`, `percent_commission`, `per_order_fixed`, and `none` entries from the `CALCULATORS` registry
- [ ] 3.4 Remove `percent_fixed`, `percent_commission`, `per_order_fixed`, and `none` entries from `METHOD_DESCRIPTORS` array
- [ ] 3.5 Remove re-exports of `PercentFixedSettings`, `PerOrderFixedSettings`, `PercentCommissionSettings` types from the barrel export block
- [ ] 3.6 Update `commission-methods/index.ts` to only export `JupiterUltraCalculator` and `JupiterManualCalculator`

## 4. Update strategy exports in `src/strategy/index.ts`

- [ ] 4.1 Remove `PercentFixedSettings` and `PerOrderFixedSettings` from the barrel re-export

## 5. Update frontend types

- [ ] 5.1 Reduce `CommissionMethodId` in `frontend/src/types/index.ts` to only `'jupiter_ultra' | 'jupiter_manual'`

## 6. Update frontend UI components

- [ ] 6.1 Remove `percent_fixed`, `per_order_fixed`, and `none` entries from `COMMISSION_METHODS` array in `BacktestCommissionSettings.tsx`
- [ ] 6.2 Remove `case 'percent_fixed'`, `case 'per_order_fixed'`, `case 'none'`, and `default` from `getDefaultMethodSettings` function
- [ ] 6.3 Remove `{commissionMethod === 'percent_fixed' && ...}` conditional settings block
- [ ] 6.4 Remove `{commissionMethod === 'per_order_fixed' && ...}` conditional settings block

## 7. Update backend CLI

- [ ] 7.1 Reduce `CliCommissionMethod` type in `backend/src/cli/types.ts` to only `'jupiter_ultra' | 'jupiter_manual'`
- [ ] 7.2 Update help text in `backend/src/cli/backtest-cli.ts` to only mention Jupiter methods

## 8. Update tests

- [ ] 8.1 In `tests/strategy/commission-calculator.test.ts`: remove tests for `percent_fixed` method, `per_order_fixed` method, `none` method; update `getAllCommissionMethodDescriptors` test to expect 2 methods; remove imports of `PercentFixedSettings` and `PerOrderFixedSettings`
- [ ] 8.2 In `tests/strategy/backtest-commission-methods.test.ts`: remove `percent_fixed`, `per_order_fixed`, `none` describe blocks; remove fallback tests that reference removed methods; update `percent_fixed` references in long-only comparison tests to use `jupiter_manual` instead
- [ ] 8.3 In `frontend/src/components/BacktestSettingsPopup.test.tsx`: remove or update tests that reference `percent_fixed`, `per_order_fixed`, or `none`

## 9. Verify

- [ ] 9.1 Run full test suite: `pnpm -r test` — confirm all tests pass
- [ ] 9.2 Run TypeScript type checking: `pnpm -r typecheck` — confirm no type errors
- [ ] 9.3 Run lint: `pnpm lint` — confirm clean lint

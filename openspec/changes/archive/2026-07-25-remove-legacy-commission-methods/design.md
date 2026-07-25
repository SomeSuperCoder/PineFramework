## Context

The commission calculation system currently has 6 methods registered in a central registry (`CALCULATORS` dict in `commission-calculator.ts`):

| Method ID | Calculator | Status |
|---|---|---|
| `percent_fixed` | `PercentFixedCalculator` | Generic — not Solana-specific |
| `percent_commission` | `PercentCommissionCalculator` | Legacy — duplicates old `commissionType: 'percent'` |
| `per_order_fixed` | `PerOrderFixedCalculator` | Generic — not Solana-specific |
| `jupiter_ultra` | `JupiterUltraCalculator` | ✅ Jupiter DEX accurate |
| `jupiter_manual` | `JupiterManualCalculator` | ✅ Jupiter DEX accurate |
| `none` | `NoneCalculator` | Removed — zero-commission not needed as a first-class method |

The four methods marked for removal each have their own source file, type definitions, settings interface, UI entries, and test coverage. The system is cleanly layered (types → calculators → index → registry → public API), making removal straightforward with no architectural changes needed.

## Goals / Non-Goals

**Goals:**
- Remove `percent_fixed`, `percent_commission`, `per_order_fixed`, and `none` from every layer of the system
- Delete the source files (`percent-fixed.ts`, `per-order-fixed.ts`, `none.ts`)
- Clean up `CommissionMethodId`, `CommissionMethodSettings`, `CALCULATORS`, `METHOD_DESCRIPTORS` to only reference kept methods
- Update frontend UI to remove the deleted methods from dropdowns and settings forms
- Update CLI to remove the deleted method options
- Update all tests to only reference kept methods
- Ensure both Jupiter methods remain fully functional

**Non-Goals:**
- No changes to the `CommissionCalculator` interface or calculation logic of kept methods
- No changes to the registry pattern or public API shape (exports stay the same, just fewer methods)
- No migration of stored user configs (removed method IDs in saved backtest configs will become unknown → `computeCommission` returns 0, which is safe)
- No changes to the legacy `commission` / `commissionType` fallback path in StrategyEngine — users who want zero commission simply omit `commissionMethod`

## Decisions

1. **Delete source files vs. keep empty files**: Delete. The files (`percent-fixed.ts`, `per-order-fixed.ts`, `none.ts`) contain only the removed calculators. Keeping them as stubs adds maintenance cost. Their exports are removed from `commission-methods/index.ts`.

2. **Remove vs. deprecate with warning**: Remove. These methods have been deprecated in practice for months (the Jupiter methods are the recommended ones). A deprecation cycle adds complexity without value — consumers on the removed methods already get 0 commission from `computeCommission` fallback.

3. **Why remove `none` too?** `none` was a first-class method ID for zero commission. With all non-Jupiter methods removed, a simpler approach applies: users who want zero commission simply omit `commissionMethod` from their config, and the legacy `commission`/`commissionType` fallback path (which defaults to commission=0) handles it. No dedicated method ID is needed.

4. **Frontend migration**: Remove `percent_fixed`, `per_order_fixed`, and `none` from `COMMISSION_METHODS` array, `getDefaultMethodSettings` switch, and the conditional settings fields (the `{commissionMethod === 'percent_fixed' && ...}` blocks and `'none'` default case).

5. **CLI migration**: Remove `percent_fixed`, `per_order_fixed`, and `none` from the `CliCommissionMethod` union and help text.

## Risks / Trade-offs

- **[Existing saved configs]** Users with saved backtest configurations that reference removed methods will silently get 0 commission after the change. **Mitigation**: Low risk — these are ephemeral client-side configs. The fallback to 0 is safe (no trades fail, they just don't get charged). Users who used `none` explicitly should simply remove `commissionMethod` from their config.
- **[Test coverage]** The removal deletes 150+ lines of tests. **Mitigation**: This is intentional — we remove tests for removed functionality. The remaining Jupiter tests continue to pass.
- **[Third-party consumers]** If any external code imports these symbols from `pine-framework`, they'll break. **Mitigation**: This is a BREAKING change per the proposal. The Jupiter system has been the default for months, so this risk is minimal.

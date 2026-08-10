# commission-calculator.test.ts asserts removed (D6/D7) behavior — suite is stale
**Date:** 2026-08-10
**Source:** Test Engineer
**Priority:** high
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Rewrite or replace `tests/strategy/commission-calculator.test.ts` (25 stale tests). The per-fill calculator registry was removed in the D6/D7 commission refactor — `getCommissionCalculator`/`computeCommission` are now unconditional compat shims (`return undefined` / `return 0`) in `src/strategy/commission-calculator.ts` (lines 234-239, 271-275). Jupiter fee math lives in `src/pnl` and is applied at trade close by StrategyEngine. Either (a) delete the stale registry/fee tests and add tests against the real `src/pnl` fee path, or (b) convert the file to assert shim behavior explicitly (registry removed, returns undefined/0) — decision belongs to the Engineer/Tech Lead owning the D6/D7 follow-up.

## Rationale
The suite currently fails 25 tests on every run (root `pnpm test` → exit 1), which masks future real regressions and forces every commit gate to triage "is this the known-broken file or a new break?" The cleanup that added `isEntry: true` / `as TradeContext` type fixes to this file did NOT cause these failures — src/ is unmodified and the shims predate the change — but the file remains a permanent red flag until the tests match current behavior.

## Evidence
- 2026-08-10 full-suite run: `Test Files 1 failed | 159 passed | 1 skipped; Tests 25 failed | 2749 passed | 7 skipped` — all 25 failures in `tests/strategy/commission-calculator.test.ts`.
- `git diff --name-only HEAD -- src/` → 0 files (backend src untouched by cleanup).
- `src/strategy/commission-calculator.ts` note: "the per-fill calculator registry was removed (D6/D7)... getCommissionCalculator/computeCommission are compat shims returning undefined/0."
- Test assertions at HEAD identical to working tree (28 `toBeDefined()`/`toBeCloseTo()` — only type-level edits applied).

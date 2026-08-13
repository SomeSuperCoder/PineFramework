# computeMonthlyReturns falsy-0 quirk (latent, pre-existing)

**Date:** 2026-08-13
**Source:** QA Engineer (equity-drawdown-chart fix blast-radius check)
**Priority:** low
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation

Fix the month-gating condition in `computeMonthlyReturns` (backend/src/backtest-runner.ts:228): replace `if (!monthly[key])` with `if (!(key in monthly))` (or `if (monthly[key] === undefined)`). Optionally clarify the intended semantics (return from previous month-end equity to the FIRST point of the month) in a comment, and add a unit test for the first-month 0% boundary case.

## Rationale

Because `0` is falsy, a month whose computed return is exactly 0 gets re-entered on the next point of the same month and overwritten by the return to the SECOND point (i.e. the first trade's return within the month). Concretely, for the golden fixture (all points in 2023-11) the intended `{2023-11: 0}` becomes `{2023-11: 2.06}`. Latent today: `monthlyReturns` is type-only in the frontend (not displayed in the UI), so no user-visible impact — but any future consumer of monthly returns inherits wrong values whenever a month opens at 0%.

## Evidence

- `backend/src/backtest-runner.ts:237` — `if (!monthly[key])` with value 0 assigned on line 238
- Reproduces fixture: `{"2023-11": 2.06}` = (10205.88 − 10000)/10000 from the second point overwriting the first point's 0
- Pre-existing: function untouched by the equity-drawdown fix; `monthlyReturns` not rendered in `frontend/src/components/BacktestResults.tsx`

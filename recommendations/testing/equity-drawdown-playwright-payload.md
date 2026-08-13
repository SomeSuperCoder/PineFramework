# Equity-drawdown Playwright smoke payload uses negative drawdown (contradicts backend contract)

**Date:** 2026-08-13
**Source:** QA Engineer (equity-drawdown-chart fix verification)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation

In `frontend/e2e/backtest-results-chart.spec.ts` (`makeEquityPoints`), change the mock drawdown values to non-negative (e.g. `Math.round((i - 4) * 25 * 100) / 100` instead of negated). The backend contract is `buildDrawdownCurve` = `peak - eq`, which is always ≥ 0.

## Rationale

The smoke payload currently feeds drawdown values 0, −25, −50, … while the dd YAxis domain is `[0, 'dataMax + 10']` → dataMax = 0 → domain [0, 10], so the negative curve clips off the bottom of the plot. The smoke still passes (it only asserts 2 line-curve elements exist), which means it never actually exercises drawdown **visibility** in a real browser — a regression that flattens the drawdown line would not be caught by the browser run (only by the unit domain-lock test).

## Evidence

- `frontend/e2e/backtest-results-chart.spec.ts:31` — `drawdown: i > 4 ? -Math.round((i - 4) * 25 * 100) / 100 : 0`
- `backend/src/backtest-runner.ts:169-177` — `buildDrawdownCurve` returns `peak - eq` ≥ 0
- `frontend/src/components/BacktestResults.tsx` — dd axis `domain={[0, 'dataMax + 10']}`

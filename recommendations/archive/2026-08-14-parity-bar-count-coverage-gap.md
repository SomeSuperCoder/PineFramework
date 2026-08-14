# API backtest payload exposes no per-bar bar count

**Date:** 2026-08-14
**Source:** Test Engineer
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Surface the resolved bar count (and, per the parity contract, `effectiveConfig`) in the API backtest result payload — e.g. `barCount` alongside `equityCurve` — so producer-parity tests can assert bar count directly instead of inferring it from `equityPoints[0].time` + `buyHoldReturn`.

## Rationale
The parity RED baseline (backend/tests/backtest-parity.test.ts, scenario A) proves the API and CLI resolve the same days-back to different bar sets (21 vs 20 bars), but the API payload exposes no per-bar array: `equityCurve.length` is `trades.length + 1` (buildEquityCurve, backend/src/backtest-runner.ts:163), and with zero trades both paths return `[initialCapital]`. Bar-set divergence is only observable indirectly (first-bar timestamp, buyHoldReturn). A direct `barCount` field would make the parity assertion exact and catch range-resolution regressions without trade noise. The `effectiveConfig` exposure is already a contract requirement (see TO-ADD comment in the test) and should land in the same wave.

## Evidence
- backend/tests/backtest-parity.test.ts scenario A: `expect(apiResult.equityCurve.length).toBe(cliAsApi().equityCurve.length)` trivially passed (1 === 1) while the resolved bar sets diverged — the assertion had to be re-expressed via bar-set evidence.
- backend/src/backtest-runner.ts:163 — `buildEquityCurve` returns `[initialCapital, ...pnl-per-trade]`.

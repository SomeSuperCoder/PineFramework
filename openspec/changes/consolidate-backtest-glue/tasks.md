## 1. Golden Fixtures (capture CURRENT behavior before rewiring)

- [x] 1.1 Add a test that runs the EXISTING code paths (route `runBacktest` + CLI `runSymbolBacktest`) against a deterministic strategy script + fixed bars, and snapshots the current `job.result` and `SymbolMetrics` to `backend/tests/fixtures/backtest-api-result.golden.json` and `backend/tests/fixtures/backtest-cli-metrics.golden.json`. Do NOT edit any glue yet.
  - **Evidence:** `backend/tests/backtest-golden-capture.test.ts` + both golden fixtures on disk.
- [x] 1.2 Save fixtures and a small deterministic harness script under `backend/tests/`.
  - **Evidence:** fixtures dir present; harness test present.

## 2. Shared Config Module

- [x] 2.1 Create `backend/src/backtest-config.ts`: `BacktestConfigInput`, `buildBacktestConfigOverride`, `applyDexFee`, `assertRealisticCommissionMethod`.
  - **Evidence:** file on disk, 124 lines, exports verified; consumed by all 3 callers.

## 3. Shared Result Module

- [x] 3.1 Create `backend/src/backtest-result.ts`: `BacktestOutcome`, `toOutcome`, `toApiResult`, `toCliSymbolResult`, `toAutoSelectMetrics`.
  - **Evidence:** file on disk, 173 lines; `toCliSymbolResult` sanitizes netProfit/netProfitPercent (Infinity→0) — single source of truth.

## 4. Rewire Callers

- [x] 4.1 CLI: `multi-symbol-runner.ts buildConfig` → `buildBacktestConfigOverride`; `symbol-runner.ts runSymbolBacktest` → `applyDexFee` + `toOutcome` + `toCliSymbolResult` (inline map/sanitize dropped); `backtest-cli.ts validateOptions` → `assertRealisticCommissionMethod`.
  - **Evidence:** git diff shows the 3 CLI files modified; `tsc --noEmit` clean; CLI parity test green.
- [x] 4.2 Route: `routes/backtest.ts runBacktest` config-build + DEX fetch + result-build → `buildBacktestConfigOverride` + `applyDexFee({onFailure:'throw'})` + `toOutcome` + `toApiResult`.
  - **Evidence:** route modified; api parity deep-equals golden fixture; `tsc` clean.
- [x] 4.3 Auto-select: `trading/auto-select-runner.ts LiveBacktestRunner` → `buildBacktestConfigOverride` + `applyDexFee({onFailure:'fallback', fallbackCommission:0.1})` + `toOutcome` + `toAutoSelectMetrics`.
  - **Evidence:** auto-select file modified; auto-select parity subset matches outcome.metrics; `tsc` clean.

## 5. Tests

- [x] 5.1 `backend/tests/backtest-parity.test.ts` asserts `toApiResult`/`toCliSymbolResult`/`toAutoSelectMetrics` deep-equal the golden fixtures / verbatim metrics subset; unit-tests `buildBacktestConfigOverride`, `applyDexFee` (throw vs fallback 0.1), `assertRealisticCommissionMethod`.
  - **Evidence:** parity test passes (30/30 total across 4 files).
- [x] 5.2 Existing `backend/tests/cli-backtest.test.ts` stays green (12 tests).
  - **Evidence:** cli-backtest.test.ts green.

## 6. Review

- [x] 6.1 Code Reviewer (T3): parity exactness confirmed, no spurious config fields injected, engine behavior untouched (`backtest-runner.ts` empty diff), no dead imports. One follow-up fix (move netProfit sanitize into `toCliSymbolResult`) folded in and re-verified GREEN. QA inherited the test verdict; did NOT re-run.
  - **Evidence:** reviewer GO; follow-up applied; re-verify 30/30 green.

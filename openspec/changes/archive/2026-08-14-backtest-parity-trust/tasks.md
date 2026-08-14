## Tasks

### 1. Parity harness (RED baseline) — D2
- [x] 1.1 Create `backend/tests/backtest-parity.test.ts` — golden pair (canned script + explicit config, fixed clock) runs through CLI path and API path; asserts identical effectiveConfig, bar count, trades, PnL, metrics. Expect RED (current divergence).
  - **Agent:** test-engineer · **Verdict:** 🔴 RED baseline → 🟢 GREEN (85/85 final)
  - **Evidence:** parity-baseline.json (6 failed/13 passed, intended RED); parity-green.json + parity-extended.json (all A/B/C producer-parity assertions pass, warnings-set parity added)
  - **Date:** 2026-08-14
- [x] 1.2 Wire parity test into the test script/CI so it runs with the backend suite and fails the build on divergence.
  - **Agent:** test-engineer · **Verdict:** 🟢 GREEN — file lives in `backend/tests/`, runs with the backend suite
  - **Evidence:** parity-green.json / parity-extended.json runs

### 2. Explicit-config contract — D1, D5
- [x] 2.1 api-designer: define the explicit-config contract — explicit-vs-absent semantics, commission whitelist enum, validation envelope, `effectiveConfig` response shape. (backend, new types)
  - **Agent:** api-designer · **Verdict:** 🟢 GREEN
  - **Evidence:** backend/src/backtest-contract.ts (324 lines) + backend/docs/backtest-contract.md; contract.json handoff
- [x] 2.2 backend-engineer: implement shared `buildBacktestConfigOverride` as a NORMALIZER (single explicit-override object); wire CLI (`multi-symbol-runner.ts:81-92`) and API (`routes/backtest.ts` → `backtest-config.ts:44-66`) to it; audit script-undeclared-field baseline so any baseline is warned, not silent (design D4 + M-warning).
  - **Agent:** backend-engineer · **Verdict:** 🟢 GREEN
  - **Evidence:** backend/src/normalize-explicit-config.ts; normalizer.json handoff; 14 baseline-applied warnings
- [x] 2.3 backend-engineer: echo engine post-merge `effectiveConfig` in `toApiResult` (`backtest-result.ts:76-134`) and CLI output path.
  - **Agent:** backend-engineer · **Verdict:** 🟢 GREEN
  - **Evidence:** toApiResult extension (normalizer.json, cli-output.json); parity suite asserts effectiveConfig equality
- [x] 2.4 frontend-engineer (M0): mirror locked contract into `frontend/src/types/index.ts` (optional request fields, `effectiveConfig`, `warnings` shapes).
  - **Agent:** frontend-engineer · **Verdict:** 🟢 GREEN (tsc 0 errors)
  - **Evidence:** types-mirror.json; contract-mirror fix caught export-failure type in results-strip wave
- [x] 2.5 frontend-engineer (M1): `useBacktestPanelState.buildConfig` sends ONLY user-touched fields — remove hardcoded defaults (commission 0, slippage 0, defaultQty 20, pyramiding 0, marginLong/Short 1, currency, initialCapital, stale solPriceUsd 150).
  - **Agent:** frontend-engineer · **Verdict:** 🟢 DONE-WITH-NOTE
  - **Evidence:** request-parity.json — only user-explicit fields sent; contract-unknown fields stripped. ⚠️ NOTE: `initialCapital` still seeded from persisted storage (documented non-goal — persisted-data migration deferred; flagged to Director)

### 3. Commission methods & fee policy — D3, D7, D8
- [x] 3.1 backend-engineer: whitelist validation everywhere — API rejects invalid/absent commission method with explicit 400 (no legacy fallback); CLI requires `--commission-method` with explicit error naming accepted values.
  - **Agent:** backend-engineer · **Verdict:** 🟢 GREEN
  - **Evidence:** commission.json; code-reviewer verified whitelist at every entry point (API normalizer, CLI validateOptions, normalizer, auto-select)
- [x] 3.2 backend-engineer: fee-failure policy — `applyDexFee` failure throws for CLI, API, auto-select (one policy); user-explicit fees bypass live fetch; live fees cached (5–15 min TTL). Remove flat-0.1% fallback (`symbol-runner.ts:54-57`, `backtest-config.ts:84-118`).
  - **Agent:** backend-engineer · **Verdict:** 🟢 GREEN
  - **Evidence:** commission.json; code-reviewer grep-clean (no fallback opts remain); 10-min TTL cache; explicit-fee bypass
- [x] 3.3 backend-engineer: auto-select mapping fix — `'jupiter-swap'` → `jupiter_manual`, `'jupiter-ultra'` → `jupiter_ultra` (`auto-select-runner.ts:61-66`); surface the selected method as a warning.
  - **Agent:** backend-engineer · **Verdict:** 🟢 GREEN
  - **Evidence:** commission.json (mapping); review-gaps.json F2 (auto-select-method warning wired at index.ts LiveBacktestRunner)
- [x] 3.4 backend-engineer: `commissionMethodMeta` table — single label source ("Jupiter Swap", "Jupiter Ultra"); CLI help + exports use it. (UI import in task 4.1.)
  - **Agent:** backend-engineer · **Verdict:** 🟢 GREEN
  - **Evidence:** backend/src/commission-method-meta.ts; code-reviewer: labels use COMMISSION_METHOD_LABELS everywhere
- [x] 3.5 Update legacy tests/scripts asserting `commission: 0` (no 0-commission path may remain).
  - **Agent:** test-engineer · **Verdict:** 🟢 GREEN
  - **Evidence:** outdated-tests.json — route + golden-capture tests updated to contract shape

### 4. Warnings & diagnostics — D4
- [x] 4.1 backend-engineer (root engine): WarningCollector sink injected at composition root via narrow `onWarning` interface; typed Warning records (type, message, context); convert the 16 console-only silence points (incl. `strategy-engine.ts:146-148` long-only suppression, `:217-227` order rejection) to warnings; export-sink failures append to the same array.
  - **Agent:** backend-engineer · **Verdict:** 🟢 GREEN
  - **Evidence:** warnings.json — src/warning-collector.ts SSOT (7-type union), 14 baselines + 3 silence points converted, buffered replay, narrow sink DI (code-reviewer verified no global state)
- [x] 4.2 backend-engineer: surface warnings in `toApiResult.warnings` and export `warnings` (dev record).
  - **Agent:** backend-engineer · **Verdict:** 🟢 GREEN
  - **Evidence:** warnings.json; parity-extended.json (warnings-set parity asserted)
- [x] 4.3 frontend-engineer (M2): results panel strip — config summary from `result.effectiveConfig` (not `jobId`) + warnings via StatusCallout notice pattern; extract new components from `BacktestResults.tsx` (448+ lines); defensive render when fields absent.
  - **Agent:** frontend-engineer · **Verdict:** 🟢 GREEN
  - **Evidence:** results-strip.json — BacktestResults.tsx 451→246; EffectiveConfigSummary.tsx + WarningsStrip.tsx (defensive); QA 6/6 flows

### 5. Date semantics — D6
- [x] 5.1 backend-engineer: shared `resolveDateRange(daysBack, symbol, timeframe, now)` — UTC-midnight day-aligned, injectable `now`; CLI fetch uses the resolved range (`multi-symbol-runner.ts:15-23`) and reports the same range (`backtest-cli.ts:320-323`); API keeps UTC-midnight via the shared resolver.
  - **Agent:** backend-engineer · **Verdict:** 🟢 GREEN
  - **Evidence:** dates.json — one resolver, three consumers; smoke-run confirmed first bar 1779753600000 / 21 bars both producers

### 6. CLI user-facing output — D1, D4
- [x] 6.1 backend-engineer: CLI output adds effective-config summary + warnings list alongside metrics (`backtest-result.ts:153-166`, `backtest-cli.ts`); update golden output expectations.
  - **Agent:** backend-engineer · **Verdict:** 🟢 GREEN
  - **Evidence:** cli-output.json — effective-config summary (toUtcDateString range, commission label) + deduped warnings section, quiet when empty; no CLI golden stdout assertions existed
- [x] 6.2 Update Justfile recipes / scripts calling the CLI (add `--commission-method`).
  - **Agent:** backend-engineer · **Verdict:** 🟢 GREEN
  - **Evidence:** cli-output.json — "Justfile/scripts needed nothing" (no stale callers)

### 7. Frontend labels & fee gate — D8, D10
- [x] 7.1 frontend-engineer (M1): normalize labels — "Jupiter (Basic Swap)" → "Jupiter Swap" (`BacktestCommissionSettings.tsx:14-26`), review-step "Jupiter Manual" → "Jupiter Swap" (`BacktestPanel.tsx:175-180`).
  - **Agent:** frontend-engineer · **Verdict:** 🟢 GREEN
  - **Evidence:** request-parity.json; QA flow 1/2 (labels render "Jupiter Swap"/"Jupiter Ultra")
- [x] 7.2 frontend-engineer (M4, conditional): fee-gate UI per locked fee policy (only if the policy changes wizard Next gating at `BacktestPanel.tsx:148-151,418`).
  - **Agent:** frontend-engineer · **Verdict:** 🟢 NOT-TRIGGERED — conditional did not fire (fee policy did not change wizard Next gating)
  - **Evidence:** no wizard gating changes required

### 8. Parity suite to GREEN — D2
- [x] 8.1 test-engineer: extend/extend-correct the parity suite as waves land — CLI vs API golden pair byte-equivalence (effectiveConfig, bars, trades, PnL, metrics); unit tests for commission validation, fee-failure policy, date resolver, warnings propagation.
  - **Agent:** test-engineer · **Verdict:** 🟢 GREEN (85/85)
  - **Evidence:** parity-green.json + parity-extended.json (warnings-set parity, schema v2, exit-code, sanitized messages)
- [x] 8.2 test-engineer (frontend): update `backtest-flow.test.tsx` (request body = user-touched only, naming, date parity); new results-strip test file (not parallel with backtest-flow).
  - **Agent:** test-engineer · **Verdict:** 🟢 GREEN (results-strip 9/9)
  - **Evidence:** results-strip.json
- [x] 8.3 Verify parity test is GREEN and passes with the full backend + frontend suites.
  - **Agent:** test-engineer · **Verdict:** 🟢 GREEN — 85/85 backend (parity + export + route + golden), 9/9 frontend strip, 6/6 QA Playwright
  - **Evidence:** parity-extended.json, outdated-tests.json, parity-recheck.json

### 9. Review & QA
- [x] 9.1 code-reviewer: one pass over the config + trust diff (normalizer, validation, fee policy, warnings, dates, CLI output, frontend contract).
  - **Agent:** code-reviewer · **Verdict:** ⚠️ REQUEST CHANGES → all 8 gaps fixed (F1-F5, F7, F8, S2) + re-verified
  - **Evidence:** parity-review.json; statgrid-nullfix.json + review-gaps.json + parity-extended.json + outdated-tests.json + parity-recheck.json
- [x] 9.2 QA: trust acceptance — Playwright user flows (request parity, results strip rendering, label normalization, fee-gate behavior), acceptance criteria from all 4 specs.
  - **Agent:** qa-engineer · **Verdict:** ✅ GO — 6/6 flows (incl. all-win null-metrics em-dash)
  - **Evidence:** parity-acceptance.json + parity-recheck.json + frontend/e2e/backtest-parity-trust.spec.ts
- [x] 9.3 docs: CLI help text, README/backtest docs updated (commission methods, fee policy, config summary output).
  - **Agent:** documentation-writer · **Verdict:** 🟢 GREEN
  - **Evidence:** readme-commission.json — README Backtesting section documents commission methods + fee policy + results summary; CLI help updated in M6; backend/docs/backtest-contract.md

### 10. Commit & close
- [x] 10.1 Tech Lead: commit verified work at feature boundaries (chore/feat/fix per wave), mark all tasks done in `tasks.md` with agent + verdict, finalize ops board.
  - **Agent:** tech-lead · **Verdict:** 🟢 GREEN — single feat commit for the parity-trust change (all gates passed: TE GREEN, QA GO, reviewer gaps closed, security PASS)
  - **Date:** 2026-08-14
- [x] 10.2 Tech Lead: report to Director — implemented/removed, breaking changes, parity evidence.
  - **Agent:** tech-lead · **Verdict:** ✅ reported
  - **Date:** 2026-08-14

## 1. Shared export module (library)

- [x] 1.1 Create `src/export/backtest-export.ts` — **Agent:** backend-engineer · **Verdict:** ✅ DONE (blocker fixes applied) · **Evidence:** build:lib clean, lib tests green, reviewer schema-lock PASS-WITH-NOTES → 4 blockers fixed + re-verified (fingerprint sha256 64-hex, timestampUnit 'ms', unrounded monthlyReturns). **Date:** 2026-08-14

## 2. CLI export path

- [x] 2.1 `--export [dir]` flag in `backtest-cli.ts` (bare default repo-root `.exports/` via import.meta.dirname, cwd-independent) — **Agent:** backend-engineer · **Verdict:** ✅ DONE · **Evidence:** typecheck green; CLI dist e2e on real Bybit network verified files land at repo root. **Date:** 2026-08-14
- [x] 2.2 `onOutcome` sink in `runSymbolBacktest` (source `script`, per-symbol export, failure never fails backtest) — **Agent:** backend-engineer · **Verdict:** ✅ DONE · **Evidence:** lib + backend tests green (13 parity untouched). **Date:** 2026-08-14
- [x] 2.3 `backend/src/backtest-export.ts` writer (atomic temp+rename, tmp cleanup on failure) + manifest — **Agent:** backend-engineer · **Verdict:** ✅ DONE · **Evidence:** manifest tests + failure-path tmp cleanup test green. **Date:** 2026-08-14

## 3. Backend API export path

- [x] 3.1 `BacktestJob.exportData` serialized at completion (source `frontend`, runId=jobId, raw request config, post-applyDexFee configOverride, required effectiveConfig; export failure isolated) — **Agent:** backend-engineer · **Verdict:** ✅ DONE · **Evidence:** backend tsc --noEmit clean; `GET /:jobId/result` untouched (verified). **Date:** 2026-08-14
- [x] 3.2 `POST /api/backtest/export { job_id }` — 200 {file} / 400 VALIDATION_ERROR / 404 JOB_NOT_FOUND / 400 JOB_NOT_COMPLETED, sanitized errors — **Agent:** backend-engineer · **Verdict:** ✅ DONE · **Evidence:** route tests green (`backend/tests/backtest-export-route.test.ts`). **Date:** 2026-08-14

## 4. Frontend export trigger

- [x] 4.1 `jobId` threading: App.tsx destructure → StrategyResultsPopup props → BacktestResults props — **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** tsc + vite build clean. **Date:** 2026-08-14
- [x] 4.2 "Export Full Data" `DropdownMenuItem` after Export CSV + 4-state machine (idle/exporting/success/error, disabled guards, role=alert error, timeout cleanup) — **Agent:** frontend-engineer · **Verdict:** ✅ DONE · **Evidence:** 8 new flow tests green (backtest-flow.test.tsx, 31/31). **Date:** 2026-08-14

## 5. Tests

- [x] 5.1 Backend tests: builder/serializer round-trip (NaN/±Infinity, fingerprint sha256, effectiveConfig guard), CLI flag + manifest + atomicity + sink-failure resilience, route 200/404/400/400, parity green — **Agent:** test-engineer · **Verdict:** 🟢 GREEN · **Evidence:** 67/67 in one run (21 lib + 11 backend + 13 parity + 12 route + integration). **Date:** 2026-08-14
- [x] 5.2 Frontend tests: dropdown visibility, POST {job_id} + JSON headers, exporting/disabled/single-fetch, success 2s revert, error retry, no-jobId disabled — **Agent:** test-engineer · **Verdict:** 🟢 GREEN · **Evidence:** backtest-flow.test.tsx 31/31. **Date:** 2026-08-14

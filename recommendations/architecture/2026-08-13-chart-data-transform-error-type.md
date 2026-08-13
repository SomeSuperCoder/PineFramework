# Fix chart-data-transform error type lie (Option B follow-up)
**Date:** 2026-08-13
**Source:** Bug Hunter + QA Engineer (error-console-crash-v1)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Follow up on the frontend type lie: `frontend/src/lib/chart-data-transform.ts:44` (`ExecuteResponse.error?: string`) and `:119` (`ExecutionResultMessage.error?: string`) claim the error is a string, but the backend sends an `EngineError` OBJECT `{message, barIndex, span?, stack?}` raw over REST (`backend/src/routes/execute.ts:178`). Introduce a shared error type (`error?: string | EngineError`) + ONE normalizer in chart-data-transform.ts that all consumers use, and optionally extend `PineScriptError` to carry `barIndex` so the popover can render "Bar N" metadata (currently dropped by design — the string-only normalizer at the storage boundary was the minimal fix).

## Rationale
The storage-boundary normalizer (`toErrorMessage` in useChartData.ts) fixes the crash but papers over the contract mismatch. A shared type + normalizer makes the boundary honest and enables richer error display (barIndex).

## Evidence
Bug Hunter: "EngineError is a documented API (tests/evil/structured-error-propagation.test.ts:59). Option B (type fix + shared normalizer in chart-data-transform.ts) is the right follow-up refactor but NOT the minimal fix." QA GO gate: "chart-data-transform type lie acknowledged + normalized at boundary — acceptable for this fix."

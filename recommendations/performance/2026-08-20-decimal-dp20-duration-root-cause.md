# decimal.js DP=20 is the real duration root cause
**Date:** 2026-08-20
**Source:** Wise Old Man (fix-architecture.json) + Bug Hunter (root-cause.json)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Profile and reduce decimal.js precision from DP=20 (`src/language/runtime/numbers/decimal-config.ts:8`) for indicator computation paths. The 3d-supertrend "long computation" that motivated the cancellation/yield work is slow primarily because every arithmetic operation runs at 20 decimal places; the async yielding and cancellation registry fixed *responsiveness and cancellability*, but each removed indicator still burns CPU until its compute completes.

## Rationale
The event loop is no longer blocked (yields), but the compute itself is still slow. Lowering DP for non-financial precision (or switching to number-based fast paths where precision isn't needed) would cut wall-clock compute time, which reduces how often cancellation even matters.

## Evidence
- WOM adjudication (data/handoffs/team/core/wise-old-man/fix-architecture.json): "decimal DP=20 out of scope follow-up"
- Bug Hunter: duration driver = decimal.js DP=20 (src/language/runtime/numbers/decimal-config.ts:8)

# Forming-candle crossPrevValues snapshot is a shallow copy (shared object aliasing)
**Date:** 2026-08-17
**Source:** team/backend/backend-engineer (M6 handoff)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Fix the forming-candle snapshot/restore of `crossPrevValues`: it uses a shallow Map copy whose `{src, cmp}` objects are SHARED with live state and mutated in place by `prev.src = ...` / `prev.cmp = ...`. If a bar is rolled back after a cross update, the restored values are the MUTATED ones. Either deep-copy the entries (`{ ...v }` per the emaState M5b precedent) or store immutable Decimal pairs so rollback is isolation-safe.

## Rationale
Pre-existing float aliasing, behavior currently preserved (M6 did NOT change it, and no test exercises the rollback-after-cross path). Once cross state is Decimal (M6), a rollback after a cross is the same aliasing risk — it only becomes visible when a rollback path actually hits it. Cheap to fix, invisible until it bites.

## Evidence
- `src/language/runtime/forming-candle.ts` — crossPrevValues snapshot/restore (shallow Map copy)
- `src/language/runtime/execution-engine.ts:270` — crossPrevValues state type
- M5b precedent: emaState snapshot uses `{ ...v }` spread for isolation

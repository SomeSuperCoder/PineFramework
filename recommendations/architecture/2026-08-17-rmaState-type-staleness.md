# rmaState declaration is stale — typed { prev: number } but stores Decimal at runtime
**Date:** 2026-08-17
**Source:** team/backend/backend-engineer (M7a handoff)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Update `src/language/runtime/execution-engine.ts` rmaState declaration from `Map<string, { prev: number; count: number }>` to the Decimal-accurate type (prev: Decimal) — the runtime already stores Decimal (M5b ta.rma migration), the type lags. Same for any other M5b-era state declarations that were under-described (`any` casts used at the time).

## Rationale
Type staleness hides real state shape from CodeGraph consumers and future maintainers; a later refactor could silently assume number math on a Decimal. Low urgency (no runtime bug — `eng as any` masks it), but the M8 consolidated code review should catch it if not fixed first.

## Evidence
- `src/language/runtime/execution-engine.ts:276` — `rmaState: Map<string, { prev: number; count: number }>`
- `src/language/runtime/builtins/ta/ta-overlap.ts` — ta.rma (M5b) stores Decimal prev at runtime
- M5b handoff note: "No state annotation change needed (tsc clean via eng as any — annotations under-describe, REPORTED)"

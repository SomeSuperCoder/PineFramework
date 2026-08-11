# Remove orphaned mock-exchange helper (dead code after alternating-strategy removal)
**Date:** 2026-08-11
**Source:** scout (context report) + refactoring-engineer (removal microtask)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
`tests/helpers/mock-exchange.ts` had exactly ONE consumer — `tests/integration/alternating-long-strategy.test.ts`, which was deleted. The helper is now dead code. Delete `tests/helpers/mock-exchange.ts` (and any of its own now-orphaned dependencies), or keep it if a future mock-trading test will reuse it.

## Rationale
Dead code adds maintenance burden and confusion. Per the Director's removal directive, this file was deliberately kept (out of the stated scope: "don't touch the test framework"), but it now has zero callers.

## Evidence
- `rg "MockExchange"` → only the deleted test + the helper itself + archived docs
- `openspec/specs/mock-trading-test/spec.md` generic requirements (Mock order execution / Position tracking / Capital percentage sizing / Test reporting) would lose their only implementation if this goes — Director should decide whether the generic mock-trading harness is still wanted.

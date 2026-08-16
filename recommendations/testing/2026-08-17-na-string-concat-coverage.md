# Runtime NA + string-concat coverage gap
**Date:** 2026-08-17
**Source:** Test Engineer (seam-final-verify)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Add a runtime test asserting PineScript `NA + "str"` semantics — the F1b fix restored the old priority (NA wins over string concat: `NA + "str"` → NA, never `String(Symbol.for('pine.na'))` garbage), but no test currently covers it. compiler.test.ts covers string-concat only at compile-time type inference; execution-engine:172 is a numeric series, not string/NA.

## Rationale
The F1b change was a behavior-preservation fix with no locking test. A future refactor of the `+` branch could silently regress `NA + "str"` to the garbage string — the exact class of regression the decimal migration is trying to eliminate. The fp-final-gate doesn't cover this case either.

## Evidence
- `tests/language/compiler.test.ts`: 53/53 GREEN — string-concat = compile-time only, no NA
- `tests/language/execution-engine.test.ts:172`: numeric series (`sma + close[100]`), no string/NA
- Test Engineer seam-final-verify finding: "GAP confirmed — no test asserts runtime NA + str semantics"
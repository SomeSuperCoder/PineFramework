# [ApplyLookbackFilter doc/behavior alignment]
**Date:** 2026-08-08
**Source:** Code Reviewer (T4 review of runtime-lookback fix)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Align the docstring at interpreter.ts:325-337 with the actual behavior: `compiledScript.maxBarsBack` falls back to `detectLookbackFromAST` (e.g. ta.sma(14) → 14) even when undeclared, so the comment "when max_bars_back is NOT declared → no filtering" is inaccurate. Reword to "declared *or statically detected*".

## Rationale
The comment contradicts the code (behavior is correct/desired, the doc is stale). Prevents future confusion about when filtering applies.

## Evidence
interpreter.ts:325-337 vs compiler.ts:64-171 (detectLookbackFromAST counts NumberLiteral indexes + constant ta.* args).
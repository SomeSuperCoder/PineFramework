# [applyLookbackFilter docstring precision: declared vs compiled maxBarsBack]
**Date:** 2026-08-08
**Source:** Code Reviewer (final T4 review, Strategy A engine fix)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
interpreter.ts:325-348 docstring says "ONLY the DECLARED max_bars_back" but enforcement reads `compiledScript.maxBarsBack`, which the compiler fills via detectLookbackFromAST when not declared (compiler.ts:293-295). Reword to "declared-or-compiled" for precision. Pre-existing semantics, doc-only.

## Rationale
Prevents future confusion about when filtering applies — behavior is correct, the comment is imprecise.

## Evidence
interpreter.ts:325-348; compiler.ts:293-295.
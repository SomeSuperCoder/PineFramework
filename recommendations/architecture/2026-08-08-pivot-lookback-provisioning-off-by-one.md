# [Pivot emission gate vs pivotLookback provisioning off-by-one]
**Date:** 2026-08-08
**Source:** Code Reviewer (final T4 review, Strategy A engine fix)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
ta-statistics.ts pivot emission gate is `len < lb+rb+2 → NA` (first 11 bars for (5,5)) but pivotLookback accounting stays `lb+rb+1` (getMaxLookback contribution). Provisioning is one bar shy of the first emission — a chunk boundary can return NA for at most one bar, self-healing on the next chunk. Consider bumping pivotLookback accounting to `lb+rb+2` for exactness, OR document the deliberate one-bar tolerance.

## Rationale
Alignment between what the runtime provisions (context) and the first possible emission avoids a one-bar NA at chunk boundaries. Currently acceptable (self-heals); exactness is a polish item.

## Evidence
src/language/runtime/builtins/ta/ta-statistics.ts:78,119 (gate) vs pivotLookback accounting (unchanged lb+rb+1).
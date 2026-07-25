## Why

The previous fix (`fix-chunk-border-markers`) guarded the `extend:right` correction behind `contextSize > 0` to prevent creating ~90-bar gaps at chunk boundaries. But this created a new problem: when `contextSize = 0` (common — many indicators like HHLL report `maxLookback = 0`), S/R lines from the newly-prepended chunk retain `extend:right` and stretch infinitely past the boundary, overlapping the old data region where the prev chunk already has its own S/R lines. This causes conflicting line rendering at the right side of the chunk boundary.

## What Changes

- When `contextSize = 0` and a newResult line has `extend:right`, find the earliest surviving prev line whose start time falls after the newResult line's endpoint and terminate the newResult line at that position (rather than letting it extend to infinity)
- When `contextSize > 0`, keep the existing behavior (the overlap computation should produce correct boundary lines)
- Both the "gap" case (fixed previously) and the "overextend" case (this fix) are handled by the same unified logic

## Capabilities

### New Capabilities

- `boundary-line-termination`: Rules for terminating prepended chunk lines with `extend:right` at the first available prev chunk pivot, bridging the gap without over-extending.

## Impact

- `frontend/src/hooks/indicator-merge.ts` — core merge logic, the extend:right fix logic updated
- `frontend/src/__tests__/indicator-merge.test.ts` — new tests for the overextend case

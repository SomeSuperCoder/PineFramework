## Context

The `prependIndicatorResult` function in `indicator-merge.ts` merges a newly-computed indicator result (partial re-execution on an older chunk) into the previous result. Lines with `extend: 'right'` from the partial execution can either:

1. **Incorrectly extend past the boundary** when the partial execution didn't see the next pivot (current behavior when `contextSize = 0`)
2. **Incorrectly get truncated** when the guard `contextSize > 0` is too aggressive (previous bug fixed in `fix-chunk-border-markers`)

The core tension: when `contextSize = 0` (indicator reports `maxLookback = 0`, so no overlap bars are included), the newResult and prev are disjoint datasets. The newResult's last S/R line has `extend:right` because no next pivot exists in the small dataset. Prev has its own S/R lines that start later. The previous fix guarded `contextSize > 0` to avoid creating gaps, but this lets the newResult line extend infinitely past the boundary — overlapping the prev lines.

The correct approach: **terminate the newResult line at the first prev pivot**, bridging the gap without over-extending.

## Goals / Non-Goals

**Goals:**
- When `contextSize = 0`, newResult lines with `extend:right` are terminated at the earliest surviving prev line's start time
- When `contextSize > 0`, existing behavior remains unchanged (lines are terminated at `extend:none` without point modification)
- Both the "gap" and "overextend" cases are handled by a single unified termination approach
- All existing tests continue to pass

**Non-Goals:**
- Changing the rendering engine's line drawing behavior
- Changing how the indicator engine produces lines during partial execution
- Adding new element types or merge capabilities
- Making `maxLookback` non-zero for HHLL (that would require engine changes and is out of scope)

## Decisions

### Decision 1: Unify extend:right handling into a single branch

**Current:** Two branches — `contextSize > 0` applies the extend:right fix (set extend to none), `contextSize = 0` skips it entirely.

**New:** Unify into a single branch that:
1. For each newResult line with `extend:right`, find the earliest surviving prev line whose `points[0].time ≥ newResultEndTime`
2. If found:
   - Set `extend: 'none'`
   - If `contextSize > 0`: no point modification (the current line already covers the overlap zone)
   - If `contextSize = 0`: update the line's last point time to the prev line's start time (bridging the gap)
3. If not found: keep `extend:right` unchanged

**Rationale:** The "find and terminate at the next pivot" logic is conceptually the same in both cases. The only difference is whether we also need to bridge the visual gap by modifying the endpoint timestamp. With `contextSize > 0`, the overlap computation already produces lines that cover the boundary correctly — just setting extend to none is sufficient. With `contextSize = 0`, the newResult line ends at the last bar of the chunk, and we need to extend it to the first prev pivot.

### Decision 2: Modify points array to terminate at boundary

**Approach:** Rather than keeping `extend:right` (infinitely long) or setting `extend:none` without modification (creates gap), update the last point's timestamp to the prev line's start time and set extend to none.

**Rationale:** This creates a visible line segment from the newResult's last pivot to the first prev pivot. The line renders correctly and covers the gap without overlapping the prev data region.

**Implementation:**
```typescript
const firstPrevLine = survivingPrevLines
    .filter(pl => pl.points[0]?.time !== undefined && pl.points[0].time >= endTime)
    .sort((a, b) => a.points[0].time - b.points[0].time)[0];

if (firstPrevLine) {
    const modifiedPoints = [...nl.points];
    modifiedPoints[modifiedPoints.length - 1] = {
        ...modifiedPoints[modifiedPoints.length - 1],
        time: firstPrevLine.points[0].time,
    };
    return { ...nl, extend: 'none', points: modifiedPoints };
}
```

**Edge case:** If `contextSize > 0`, we don't modify points — just set extend to none. The overlap bars already produce correct boundary positioning.

### Decision 3: Filter logic for survivingPrevLines context

The `survivingPrevLines` variable already exists in `prependIndicatorResult` and contains all prev lines that were NOT replaced by full-identity matching. This is the correct set to search — it includes lines from the prev dataset that are truly independent of newResult lines.

## Risks / Trade-offs

- **[Risk]** Price mismatch: The terminated newResult line's price may differ from the first prev line's price (different S/R level). **Mitigation:** This is correct behavior — the gap is precisely where the S/R level changed. The visual shows a step from one level to the next, which is what the indicator draws. The alternative (infinite extension) shows the old level overlapping the new region, which is worse.
- **[Risk]** Exact timestamp match: If the newResult line's endpoint equals the prev line's start time (same bar), the modification is a no-op. **Mitigation:** The `>=` check handles this — `extend` is set to none and no effective point change occurs.
- **[Risk]** Added line count changes: Modifying a newResult line in-place doesn't change the line count. However, if multiple newResult lines have extend:right and are terminated at different prev lines, each independently gets the correct behavior. **Mitigation:** Each line is processed independently; no cross-line interference.
- **[Risk]** The HHLL `var` line mutation: The HHLL indicator mutates the same `var resLine` across bars. When the backend serializes, it captures the final state of all line objects. All lines in `newResult.lines` are final-state snapshots — modifying their points in the merge doesn't affect the backend's state.

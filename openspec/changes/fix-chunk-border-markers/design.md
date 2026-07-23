## Context

The scroll-back mechanism (`fetchOlderOHLCV` in `useChartData.ts`) prepends new OHLCV bars and re-executes each indicator on a truncated dataset consisting of the new bars plus a small context window (up to `maxLookback` bars) from the previous dataset. The results are merged in `prependIndicatorResult` (`indicator-merge.ts`).

Current merge logic for each element type follows a pattern:
- **Replaced if matched**: If newResult contains an element with the same key (time for shapes/labels/lines, startTime for boxes, from+to for fills), the prev element is replaced.
- **Dropped if in overlap zone**: Elements from prev whose key falls in the overlap timestamp set are DROPPED — even if they were NOT reproduced by the re-execution.

This second filter is the root cause. The overlap zone exists to prevent double-counting elements when the re-execution reproduces them. But when the re-execution on the truncated dataset doesn't reproduce a particular element (because the smaller dataset changes behavior of functions like `findprevious()`, `bar_index`, or conditional logic), that element is silently lost.

Additionally, `strategyMarkers` are merged by simple concatenation but their `barIndex` values are never adjusted for the prepended bars, causing strategy markers from prev to render at the wrong horizontal position.

## Goals / Non-Goals

**Goals:**
- Elements in the overlap zone that were NOT reproduced by re-execution survive the merge instead of being dropped
- Strategy marker `barIndex` values are correctly shifted after prepend
- All element types (lines, shapes, labels, boxes, fills, bgcolor) behave consistently
- Existing dedup behavior is preserved — elements that ARE reproduced by re-execution still replace prev ones
- No regressions in existing scroll-back scenarios

**Non-Goals:**
- Changing how the indicator engine produces elements (that's working correctly)
- Changing how elements are rendered (rendering uses absolute timestamps and is correct)
- Adding new element types or capabilities
- Performance optimization of the merge path

## Decisions

### Decision 1: Replace overlap-drop with overlap-prefer-new

**Current:** `survivingPrev = prev.filter(e => !isInOverlap(e))` — drops ALL overlap-zone elements from prev.

**New:** Keep the overlap filter, but change the surviving condition from "NOT in overlap" to "in overlap AND NOT replaced by newResult". Elements in the overlap that were replaced by newResult are still dropped (the new version wins). But elements in overlap that were NOT replaced by newResult survive.

**Rationale:** The original intent of the overlap filter was to avoid duplicates when re-execution reproduces elements. The fix aligns the filter with its actual purpose — dedup — instead of blindly discarding.

**Implementation change per element type:**

| Element | Key | Current Filter | New Filter |
|---------|-----|---------------|------------|
| shapes | `time` | `!inOverlap(s.time)` | `!(inOverlap(s.time) && replaced)` |
| lines | `points[0].time` | `!inOverlap(points[0].time)` | `!(inOverlap(points[0].time) && replaced)` |
| labels | `time` | `!inOverlap(l.time)` | `!(inOverlap(l.time) && replaced)` |
| boxes | `startTime` | `!inOverlap(b.startTime)` | `!(inOverlap(b.startTime) && replaced)` |
| fills | `from`+`to` | no overlap filter (already correct) | no change |
| bgcolor | `time` | `!inOverlap(b.time)` | `!(inOverlap(b.time) && replaced)` |

### Decision 2: Strategy marker barIndex shifting

**Current:** Strategy markers are concatenated without any barIndex adjustment.

**New:** After merging, shift prev strategy marker `barIndex` values by `addedCount` to account for the prepended bars at position 0-N.

This matches how `alertTriggers` are already handled (lines 203-214 of indicator-merge.ts).

**Rationale:** Strategy markers use 0-based barIndex from the execution. After prepend, the same physical bar has a higher index. Without the shift, markers from prev render at the wrong position.

### Decision 3: Lines with extend behavior at boundaries

The recent HHLL line extend fix (commit `091cba7`) already handles the case where re-execution on a truncated dataset produces lines with incorrect `extend:right`. The fix checks surviving prev lines to detect terminated lines. This logic is correct and compatible with the overlap-prefer-new approach — it just needs its input (survivingPrevLines) to be larger after our fix.

### Decision 4: Test strategy

Each element type gets a dedicated unit test in `indicator-merge.test.ts` that:
1. Creates a prev result with an element exactly at the chunk boundary (in the overlap zone)
2. Creates a newResult from truncated re-execution that does NOT reproduce this element
3. Asserts the element survives in the merged result
4. Creates a second test where newResult DOES reproduce the element, asserting the new version wins

## Risks / Trade-offs

- **[Risk]** Memory/performance: Preserving more elements from prev increases the merged result size. **Mitigation:** The overlap zone is typically small (maxLookback bars, often 0-250). The absolute number of additional elements is bounded and negligible.
- **[Risk]** Stale elements: An element in the overlap that should have been replaced because its condition no longer holds will survive if re-execution doesn't reproduce it. **Mitigation:** This is the same behavior as elements OUTSIDE the overlap zone — they always survive. The fix is consistent. The re-execution uses the correct data context and will reproduce any element whose condition still triggers.
- **[Risk]** Double-rendering: If an element is both in survivingPrevLines and in fixedNewLines, it renders twice. **Mitigation:** The "replaced" check prevents this — if newResult produces a line with the same start time, the prev one is dropped.

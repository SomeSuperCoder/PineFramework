## Context

The scroll-back mechanism (`fetchOlderOHLCV` in `useChartData.ts`) prepends new OHLCV bars and re-executes each indicator on a truncated dataset consisting of new bars plus a context window from the previous dataset. Results are merged in `prependIndicatorResult` (`indicator-merge.ts`).

Current label merge logic (lines 210-215):
```typescript
const mergedLabels = [
  ...newResult.labels,
  ...prev.labels.filter(
    (l) => !newResult.labels.some((n) => n.time === l.time),
  ),
];
```

This deduplicates by timestamp only. When re-execution produces different labels at different timestamps (due to `ta.valuewhen()` state differences), both sets appear in the merged result — causing labels to "stack" at chunk boundaries.

## Goals / Non-Goals

**Goals:**
- Labels in the overlap zone are replaced entirely by the re-execution result
- Labels outside the overlap zone are preserved
- The fix is minimal and focused on the label merge logic only
- Existing behavior for other element types (shapes, lines, boxes, fills, bgcolor) is unchanged

**Non-Goals:**
- Changing how labels are created in the execution engine
- Changing how labels are rendered
- Fixing line or shape merging (already handled correctly)
- Handling labels from different indicators

## Decisions

### Decision 1: Replace overlap labels instead of deduplicating by timestamp

**Current:** Labels are merged by timestamp dedup — if `newResult.labels` has a label at time T, the prev label at time T is dropped, otherwise it survives.

**New:** ALL prev labels in the overlap zone are dropped, and ALL newResult labels are kept. This ensures the re-execution (which has the correct context for the overlap bars) is the single source of truth for labels in that zone.

**Implementation:**
```typescript
const mergedLabels = [
  ...newResult.labels,
  ...prev.labels.filter(
    (l) => !overlapTimestamps?.has(l.time)
  ),
];
```

**Rationale:** The overlap zone exists precisely because re-execution may produce different results than the original execution. For labels (which depend on stateful functions like `ta.valuewhen()`), the re-execution result is authoritative. Keeping prev labels that happen to have different timestamps creates duplicates.

**Alternatives considered:**
1. Match labels by (time, text, price) tuple — rejected because re-execution may produce the same logical label at a different price (different pivot detection)
2. Match labels by (text, price) only — rejected because same text/price could appear at different times in different executions
3. Use a more sophisticated label identity system — over-engineered for the problem

### Decision 2: Reuse existing `overlapTimestamps` parameter

The `overlapTimestamps` Set is already computed and passed to `prependIndicatorResult`. We reuse it for label filtering, avoiding any changes to the function signature or call sites.

## Risks / Trade-offs

- **[Risk]** Labels that were genuinely created in the overlap zone but NOT reproduced by re-execution will be lost. **Mitigation:** This is the intended behavior — the re-execution has the correct context and should reproduce any label whose conditions still hold. If a label disappears, it means the re-execution's context differs, and the original label was based on incomplete data.

- **[Risk]** Edge case: re-execution produces no labels in the overlap zone. **Mitigation:** All prev overlap labels are dropped, leaving a gap. This is correct — if the re-execution says "no label here", we trust it.

- **[Risk]** Performance: The `overlapTimestamps.has()` lookup is O(1). No performance impact.

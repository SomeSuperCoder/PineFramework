## Context

When the user scrolls left on the chart, the frontend loads older OHLCV data in chunks (~200 bars) and re-executes indicators on the expanded dataset. Each re-execution includes a "context" window — bars from the previously loaded data — so the indicator's lookback (warmup) is satisfied and the boundary between old and new data renders correctly.

The current flow in `fetchOlderOHLCV()` (`frontend/src/hooks/useChartData.ts`):

```
contextSize = Math.max(maxLookback, newBars.length)    // e.g., 1000
contextBars = oldBars.slice(0, contextSize)              // may be < 1000 if insufficient history
actualContextSize = contextBars.length                    // e.g., 300
execBars = [...newBars, ...contextBars]                  // 200 + 300 = 500 bars
```

The re-execution returns a result with `500` entries. The first `maxLookback` (1000) entries of a normal execution would be warmup nulls — but since we only have 500 bars, **all** entries are in the warmup zone, so **all** plot values are null.

In `prependIndicatorResult()` (`frontend/src/hooks/indicator-merge.ts`), the merge unconditionally replaces the overlap region:

```typescript
const replacedPrev = newPlot.data.slice(
  addedCount,
  addedCount + contextSize,        // contextSize = 1000, but data only has 500 entries
).concat(plot.data.slice(contextSize));
```

`newPlot.data.slice(200, 200 + 1000)` returns items 200–499 (300 entries, all null because warmup = 1000). These 300 nulls replace the first 300 entries of `prev` — destroying valid data and creating a visible rendering gap.

### Root cause

The merge assumes the re-execution's overlap region is *authoritative* — that it correctly recomputed every bar in the overlap. This assumption breaks when `actualContextSize < maxLookback`, because the warmup null zone extends into the overlap region. The problem is not limited to "the previous chunk" — any chunk border where insufficient context was available will produce warmup-null overwrites. With a lookback of 1000 bars and 200-bar chunks, every chunk border for the first 5 prepends will have this issue.

## Goals / Non-Goals

**Goals:**
- Eliminate warmup-induced NA gaps at chunk borders by making the merge null-safe
- Ensure warmup holes heal naturally as context accumulates with subsequent chunk loads
- Apply the fix to plot data, `plotColors`, and `fillColorData` consistently

**Non-Goals:**
- Changing the chunk loading strategy (chunk size, fetch logic) — that's a separate optimization
- Changing `getMaxLookback()` reporting — already handled by `fix-chunk-border-underrendering`
- Removing the warmup zone itself — that's inherent to Pine Script lookback semantics
- Adding backend warmup metadata for this change (deferred — the frontend can detect null-plateaus locally)

## Decisions

### Decision 1: Null-safe merge for plot data

**Approach:** In `prependIndicatorResult()`, when merging plot data in the overlap zone, only overwrite `prev` entries where the new value is non-null. When `newResult` has `null` (warmup), keep `prev.data[i]`.

```typescript
// Before (unconditional replace):
const replacedPrev = newPlot.data.slice(
  addedCount,
  addedCount + contextSize,
).concat(plot.data.slice(contextSize));

// After (null-safe):
const overlapFromNew = newPlot.data.slice(addedCount, addedCount + contextSize);
const replacedPrev = overlapFromNew.map((v, i) =>
  v !== null ? v : (plot.data[i] ?? null)
).concat(plot.data.slice(contextSize));
```

**Rationale:** A null in the new result means "the indicator couldn't compute a value here because it didn't have enough history" — not "the value should be erased." Keeping the previous value is strictly better than creating a rendering gap.

**Edge case:** If `prev.data[i]` is also null and new value is null, the result is null — correct (both executions agree there's no value).

### Decision 2: Null-safe merge for plotColors and fillColorData

**Approach:** Apply the same null-safe pattern to `plotColors` and `fillColorData` in their respective merge sections.

**Rationale:** The previous unconditional approach for `plotColors` was motivated by fixing "orphaned uncolored line" bugs where stale colors persisted after re-execution. However, that fix traded one bug for another: it stopped the orphaned-line bug but introduced warmup-gap bugs. A null-safe merge gets the best of both:
- When the re-execution has a valid color (warmup satisfied), it takes precedence over stale colors.
- When the re-execution has null (warmup zone), the previous color survives, preventing visual gaps.

### Decision 3: Detect warmup by null-plateau, not explicit metadata

**Approach:** The frontend does not need backend metadata to identify warmup nulls. They are detectable as leading null runs in the execution result.

**Rationale:** The warmup zone always produces null entries for every plot in the result. A null at position `i` in the overlap could be either warmup (leading edge of the execution) or a legitimate gap in the indicator's output (e.g., conditional plotting). We handle this by the null-safe merge: for *all* nulls, keep prev — whether warmup or not. This is safe because:
- If it's a warmup null: prev had the correct value, keep it ✓
- If it's a genuine indicator gap: prev was also null (indicator didn't plot), so keeping null is correct ✓
- If it's a genuine gap where prev had a stale value due to different context: this is the "orphaned color" case. But with correct `maxLookback` (from `fix-chunk-border-underrendering`), once context suffices, the re-execution will produce non-null values and overwrite the stale prev data. Between `maxLookback` being correct and the null-safe merge, the window where stale data can persist is bounded.

### Decision 4: Multi-chunk healing is automatic

**Approach:** No separate healing mechanism is needed. When a third chunk is prepended, the re-execution has more total context (`oldBars` now includes the second chunk + original data), so `actualContextSize` increases. Eventually `actualContextSize >= maxLookback`, the warmup nulls no longer extend into the overlap, and the merge replaces old data with fresh computed values. This naturally "heals" gaps created during earlier chunk loads.

**Edge case:** If the user scrolls back and forth rapidly, the healing may not occur until the user stops and the system accumulates enough context. This is acceptable — gaps close within one chunk load of having sufficient context.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| **Stale data persistence**: If `maxLookback` is underreported (the `fix-chunk-border-underrendering` change isn't applied yet), the warmup zone is larger than expected and nulls persist longer | This change is designed to work *with* the `fix-chunk-border-underrendering` change, but also works independently — it's strictly better than the current unconditional overwrite |
| **Stale colors persist**: The null-safe merge for `plotColors` could keep stale colors from a previous execution when the re-exec has a warmup null | Only when warmup isn't satisfied. With correct `maxLookback`, warmup nulls are bounded. The orphaned-color regression was caused by unconditional *replacement*, not by conditional *preservation* — preserving is the safer default |
| **Performance**: `map` + null check adds minimal overhead to the merge | Negligible — the merge already iterates over all entries. A single `!== null` check per entry is free |
| **Over-preservation of genuinely null data**: If an indicator legitimately has no value for a bar (conditional plot), and prev also had no value, we keep null — correct behavior | No issue, both agree on null |

## Migration Plan

1. **Modify `prependIndicatorResult()`** in `frontend/src/hooks/indicator-merge.ts`:
   - Plot data merge: add null-safe `map` for the overlap region
   - `plotColors` merge: same null-safe pattern
   - `fillColorData` merge: same null-safe pattern

2. **Update existing tests** in `frontend/src/__tests__/indicator-merge.test.ts`:
   - Existing tests should pass with the null-safe change (null values that were replacing prev data are now preserved)
   - Add new test cases for warmup scenarios

3. **Add integration test** in `tests/integration/`:
   - Execute an indicator with `maxLookback > availableContext`
   - Verify that the merged result preserves prev data where new result has null

4. **Verify**: Load the app, scroll left through multiple chunks, confirm no persistent NA gaps at chunk borders

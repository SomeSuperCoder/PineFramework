## Why

When indicators execute at chunk boundaries during scroll-back, plot data has persistent NA gaps where warmup zone nulls overwrite previously valid data. This happens because `prependIndicatorResult()` unconditionally replaces the overlap zone with the re-execution result — but if the re-execution didn't have enough context bars to satisfy the indicator's full lookback, its warmup zone extends into the overlap region and destroys valid data from the previous chunk. This affects *any* chunk border where `maxLookback > availableContext`, not just a specific previous chunk — with a high-lookback indicator (e.g., 1000 bars) and small chunks (200 bars), every consecutive chunk border can leave a gap.

## What Changes

- **Warmup-aware merge** in `prependIndicatorResult()`: when merging plot data at the overlap zone, only overwrite `prev` entries where the new result has non-null values. Keep `prev` values when new data is null (warmup hole).
- **Stale maxLookback tolerance**: when a re-execution produces more warmup nulls than expected (because the actual context available was less than `maxLookback`), the merge should not destroy valid data with those nulls.
- **Multi-chunk gap healing**: as more chunks are prepended and more context accumulates, previously unfillable warmup holes should naturally heal when a subsequent re-execution has enough context. The merge logic must preserve this healing property.
- **Backend warmup metadata**: optionally expose `warmupCount` (number of null/NA entries) in the execution result so the frontend can make informed merge decisions without guessing which entries are warmup.

## Capabilities

### New Capabilities
- `warmup-aware-merge`: Safe merging of indicator plot data at chunk boundaries that preserves valid data across warmup zones, and heals gaps as context accumulates

### Modified Capabilities
- `chunk-border-data-merge`: Extend the existing merge spec with warmup-aware merge requirements for plot data, plotColors, and fillColorData
- `scroll-re-execution`: Update the context-size negotiation to handle cases where `maxLookback > availableContext` gracefully

## Impact

- **Frontend:** `frontend/src/hooks/indicator-merge.ts` — `prependIndicatorResult()` merge logic for plots, plotColors, fillColorData
- **Frontend:** `frontend/src/hooks/useChartData.ts` — `fetchOlderOHLCV()` context size determination
- **Backend (optional):** `src/language/runtime/execution-engine.ts` — expose `warmupCount` in `ExecutionResult`
- **Tests:** New integration and unit tests for warmup-aware merge scenarios

## Why

Real-time WebSocket updates corrupt shapes, labels, lines, fills, and boxes on trailing candles because the merge logic (`mergeDiffIntoResult`) replaces array entries by **position** (`slice(0, -N)`) instead of by **timestamp**. Since these arrays are sparse (only bars where `plotshape()`/`label.new()`/`line.new()` etc. fire), each WS update replaces the wrong entry, causing a domino effect where every new kline displaces a different trailing visual element.

This is the root cause of the "last 20–40 candles get wrong labels that change 3 times" bug.

## What Changes

- **`mergeDiffIntoResult`** — Replace `slice(0, -N)` + append with **timestamp-keyed merge** for shapes, labels, lines, fills, and boxes. Entries whose timestamp matches a diff entry are removed before appending the new ones.
- **`prependIndicatorResult`** — Fix concatenation of shapes/labels/lines/fills/boxes when older bars are loaded (scrolling left). Currently merges with `[...newResult.shapes, ...prev.shapes]` which duplicates entries for overlapping boundary bars. Switch to deduplicated merge by timestamp.
- **`ChartComponent` shape/label matching** — Verify that shape-to-candle matching uses exact timestamps, not array-offset heuristics.
- No new capabilities. No breaking changes. Existing behavior preserved; only the merge strategy changes.

## Capabilities

### New Capabilities

*(none — this is a bug fix)*

### Modified Capabilities

*(none — this is a correctness fix, no spec-level behavior changes)*

## Impact

| File | Change |
|------|--------|
| `frontend/src/hooks/useChartData.ts` | Rewrite `mergeDiffIntoResult` shape/label/line/fill/box merge (lines ~499–596); fix `prependIndicatorResult` concatenation (lines ~406–433) |

The merge logic is constrained to a single file. Test coverage exists via integration tests (`tests/integration/q-trend-*.test.ts`). No API changes, no data model changes, no breaking changes.

## Context

`mergeDiffIntoResult` in `frontend/src/hooks/useChartData.ts` (line ~453) processes real-time WS diff messages to incrementally update `ScriptResult` without re-executing all bars. It handles 5 sparse arrays:

| Array | Line | Current merge |
|-------|------|---------------|
| `shapes` | 507 | `prev.slice(0, -N) + diff` |
| `labels` | 539 | `prev.slice(0, -N) + diff` |
| `fills` | 516 | `prev.slice(0, -N) + diff` |
| `lines` | 526 | `prev.slice(0, -N) + diff` |
| `boxes` | 594 | `prev.slice(0, -N) + diff` |

For **plots** (dense array — every bar has a value), the merge correctly uses `msg.barIndex` to determine append vs replace. For sparse arrays, bar-index comparison would also solve the problem — entries carry their bar's timestamp, so merge by timestamp.

`prependIndicatorResult` (line ~378) handles merging when older bars are loaded via `fetchOlderOHLCV`. It concatenates sparse arrays without deduplication, causing duplicate shapes/labels on boundary bars.

## Goals / Non-Goals

**Goals:**
- Every real-time WS diff correctly updates shapes/labels/lines/fills/boxes — only entries for the same timestamp are replaced
- Prepend merge deduplicates — no duplicate shapes/labels on boundary bars when scrolling left
- Plots remain unaffected (already correct)
- Zero behavioral change for initial HTTP full execution (no merge involved)

**Non-Goals:**
- No data model changes — `ScriptResult`, `ShapeData`, `LabelData`, `LineData`, `FillData`, `BoxData` types stay as-is
- No API changes — HTTP execute route, WS protocol, `ScriptResult` shape all unchanged
- No performance optimization of the rendering path — only the merge logic is touched

## Decisions

### Decision 1: Merge by timestamp (not bar index or array position)

**Choice:** Filter out existing entries whose `time` matches any diff entry's `time`, then append diff entries.

```
current: [s₄₂, s₈₇, s₁₁₈, s₃₂₁, s₅₇₈, s₆₂₁, s₇₃₄, s₈₉₁, s₉₄₅, s₉₉₀]
diff:    [s₁₀₀₀]  (bar 1000)

merge:   prev.filter(s => !diff.some(d => d.time === s.time))  // nothing filtered (no match)
         .concat(diff)                                          // → [s₄₂, s₈₇, ...s₉₉₀, s₁₀₀₀]
```

```
diff:    [s₉₉₀']  (update for bar 990 on a re-kline)

merge:   prev.filter(s => !diff.some(d => d.time === s.time))  // s₉₉₀ removed
         .concat(diff)                                          // → [s₄₂, s₈₇, ...s₉₄₅, s₉₉₀']
```

**Rationale:** Timestamp is the stable identity key. Array position drift is the root cause of the bug.

**Alternatives considered:**
- *Bar-index merge* — Would also work, but timestamp is already present on every diff entry and is more resilient (bar indices can change when bars are prepended)
- *Custom Set data structure* — Over-engineered for a simple filter-concat pattern

### Decision 2: Deduplicate in `prependIndicatorResult` by timestamp

**Choice:** Instead of `[...newResult.shapes, ...prev.shapes]`, use the same filter-concat pattern to avoid duplicates on boundary bars.

**Rationale:** The new execution result covers ALL bars (including the overlap with prev). Filtering out any timestamp that already exists in prev prevents duplicates.

### Decision 3: Keep `ChartComponent` shape matching as-is

**Choice:** After verifying, the chart component already matches shapes to candles by timestamp (it iterates `data[]` and filters shapes/labels by `time === candle.time`). No change needed.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| **Performance regression** — `filter` + `some` on large arrays (e.g., 10K shapes) is O(n*m) | Shape/label arrays are bounded by design — typically <100 entries even for 10K bars. Array iteration is negligible vs canvas rendering. If profiling shows a hotspot, a `Set<number>` of diff timestamps can make it O(n+m). |
| **Duplicate shapes if timestamps collide** — Two diff entries with the same timestamp but different content (e.g., forming candle vs confirmed bar) | This is desired behavior — the diff replaces the forming-candle entry with the confirmed one. The filter removes any entry with a matching timestamp, so the new one always wins. |
| **Backward compat with existing test data** | No test fixture changes needed. Existing integration tests validate correct shape/label output; they don't test real-time merge. If desired, a new test can validate the merge strategy directly. |
| **Lines with `extend` span multiple bars** — A line diff might need to replace a specific line object, not just "any line at this timestamp" | Lines don't have a single timestamp — they have `points: [{time, price}, {time, price}]`. The current approach (replace last N) is wrong for lines too. Need to identify lines by a stable ID. **But** the WS diff protocol sends ALL current lines for the latest bar as part of each diff. See open question below. |

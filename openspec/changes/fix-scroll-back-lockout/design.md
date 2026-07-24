## Context

The scroll-back mechanism in `fetchOlderOHLCV` uses a single `hasMoreHistoryRef` boolean ref that, once set to `false`, permanently prevents all future scroll-back requests. This is too aggressive:

1. **The gate at line 78** (`if (!hasMoreHistoryRef.current) return 0`) short-circuits before any request.
2. **Three paths set it to `false`**: (a) oldest bar missing timestamp, (b) empty response, (c) backend returns `hasMore: false`.
3. The Bybit backend returns `hasMore: false` when it couldn't fill the full `limit=200` bars — e.g. returning just 3 bars with `hasMore: false`. This is not "no more data," it's "this chunk happened to be small."
4. Once locked out, only a full page reload resets it (the ref initializes to `true`).

The `isLoadingHistoryRef` guard already prevents duplicate concurrent requests. The `hasMoreHistoryRef` adds no useful protection — it's a permanent one-shot that's far too brittle.

## Goals / Non-Goals

**Goals:**
- Remove the permanent `hasMoreHistoryRef` lockout so scroll-back always retries on overscroll
- Keep protection against pointless re-fetches: skip requests when the backend itself confirms zero data left (empty array response)
- Keep protection against concurrent duplicate requests (`isLoadingHistoryRef`)
- Process partial chunks (fewer bars than `limit`) normally — append them to the visible chart

**Non-Goals:**
- No backend changes
- No changes to how chunks are displayed, how indicators re-execute, or how viewport adjusts
- No changes to the initial data fetch path
- No performance optimization of the scroll-back loop itself

## Decisions

### Decision 1: Remove `hasMoreHistoryRef` entirely

**Chosen:** Delete the ref, its gate, and all code that sets it.

**Rationale:**
- `hasMoreHistoryRef` provides zero unique value over the existing guards:
  - `isLoadingHistoryRef` prevents concurrent requests (correct rate-limiting mechanism)
  - Empty data check (`json.data.length === 0`) is the only real "no more data" signal
- The backend `hasMore` field is unreliable — it reflects whether the backend *could fill the limit*, not whether *more data exists*. Bybit returns `hasMore: false` on the first scroll-back chunk that happens to be small.
- A ref that permanently kills scroll-back after one partial chunk is worse than no gate at all.
- The cost of a failed fetch (returns 0 bars, no-op) is trivial — imperceptible to the user.

**Alternatives considered:**
- *Demote to soft limiter*: only skip if `hasMore === false` AND `length === 0`. But this still needs code to set and clear the ref, adding complexity for no benefit over just checking `length === 0` inline.
- *Keep ref, reset on non-empty response*: possible but over-engineered. The simplest correct thing is to just not use a permanent boolean.

### Decision 2: Keep the empty-data early-return as sole guard

**Chosen:** The existing `!json.data || json.data.length === 0` check at lines 91-94 stays (minus the `hasMoreHistoryRef` assignment). When the backend returns an empty array, `fetchOlderOHLCV` returns `0` — the caller handles it as a no-op.

**Rationale:**
- An empty response is the only reliable "no more data" signal — the server explicitly said "I have nothing to give you."
- Returning `0` means the caller (`onRangeChange` in `ChartComponent`) gets a `0` added count and does nothing — no re-render, no adjustment.
- If real data later exists (edge case: server transient failure), the next overscroll will retry — which is the correct behavior since `isLoadingHistoryRef` will be `false` by then.

### Decision 3: Remove the `!oldest || !oldest.timestamp` early return

**Chosen:** The check at lines 80-84 (`if (!oldest || !oldest.timestamp) { hasMoreHistoryRef.current = false; return 0; }`) remains as an early return but WITHOUT setting any ref.

**Rationale:**
- If `ohlcvDataRef.current` is empty, there's nothing to prepend data before — returning 0 is correct.
- But setting a permanent flag here is wrong: after initial data loads, this path would never be hit. The check is effectively dead code for a populated chart. Keeping it without the ref assignment is harmless.

## Risks / Trade-offs

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Infinite retry on empty server response | Low | Empty response returns 0 bars, which produces no visible change. The next overscroll triggers again. `isLoadingHistoryRef` prevents concurrent storms. Each retry costs one HTTP request — acceptable for user-initiated drag actions. |
| Network storm from rapid overscrolling | Low | `isLoadingHistoryRef` already serializes requests. The drag must travel ~400px past the edge to trigger one call; user can't trigger more than ~2-3 requests per second. |
| Data duplication if same chunk fetched twice | Low | The API uses `end` param (oldest timestamp - 1), so re-fetching returns strictly older data. The current code prepends unconditionally — no overlap possible. |

## Migration Plan

- Single-file change in `frontend/src/hooks/useChartData.ts`
- Remove `hasMoreHistoryRef` declaration and all 4 uses (line 78 gate, lines 82/92/96 assignments)
- Keep the empty-data early-return but drop the `hasMoreHistoryRef.current = false` from it
- Keep `isLoadingHistoryRef` check and `!oldest` guard (without ref assignment)
- Update test at `frontend/src/hooks/useChartData.test.ts` if it references `hasMoreHistoryRef`
- Run all 1604+ unit tests + e2e test to confirm no regressions
- Rollback: revert the single commit

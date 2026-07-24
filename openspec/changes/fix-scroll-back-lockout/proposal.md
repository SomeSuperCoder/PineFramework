## Why

Scrolling left (drag-pan) to load older chart data breaks after a single chunk: the `hasMoreHistoryRef` flag becomes permanently `false` when the backend returns fewer bars than requested (e.g. 3 bars with `hasMore: false`), locking out ALL future scroll-back attempts until a full page reload. Users cannot progressively load older data beyond the first partial response.

## What Changes

- **Remove the permanent `hasMoreHistoryRef` lockout** from `fetchOlderOHLCV`. The gate at the top of the function (`if (!hasMoreHistoryRef.current) return 0`) is removed — let every overscroll attempt make a fresh request. The `isLoadingHistoryRef` guard already prevents request storms.
- **Demote `hasMore` to a hint, not a hard gate**: when the backend returns `< limit` bars, process them normally (prepend, re-execute indicators, update chart) instead of setting a permanent flag. Only stop retrying when the response contains **zero bars** (`json.data.length === 0`) — that's the true signal that no older data exists.
- **Remove the `hasMoreHistoryRef` ref entirely** — it's no longer needed. The only guard against redundant requests is `isLoadingHistoryRef`.

## Capabilities

### New Capabilities
- *(none)*

### Modified Capabilities
- *(none — pure implementation change, no spec-level behavior change)*

## Impact

- `frontend/src/hooks/useChartData.ts` — `fetchOlderOHLCV` function: remove `hasMoreHistoryRef`, move the empty-data check to be the sole lockout signal
- All scroll-backs now retry naturally on each overscroll instead of being permanently blocked
- No impact on backend, no new API surface, no configuration changes

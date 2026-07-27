## Context

When an indicator is added to the chart, the frontend executes it via two paths:

1. **HTTP execution** (`executeScript` in `useChartData.ts`): fetches OHLCV bars, POSTs to `/api/execute`, then sends the source to the WebSocket for real-time updates. The HTTP path has multiple `await` points (OHLCV fetch → execute → seed bars → re-execute) that create race windows.
2. **WebSocket execution**: after the HTTP path, the source is sent via WebSocket for ongoing real-time bar updates via `reexecuteForTopic`.

When the user removes an indicator during initial load (or any HTTP execution in flight):

- `handleRemoveIndicator` in `App.tsx` sends `stop_indicator` (removes the session from `sub.sessions` on the server) and calls `removeIndicatorData` (clears `indicatorSourcesRef.current`).
- But the HTTP response may still be in flight. If it arrives after the cleanup, `executeScript` calls `onIndicatorResult`, which adds the result back to `indicatorResults` and plots it.
- The indicator label is already gone → no UI handle to remove the orphaned plot data.
- Additionally, already-plotted data from a prior computation cycle is not explicitly cleaned up when the indicator is removed — it only disappears on the next chart re-render if `indicatorResults` no longer contains it.

The server-side `ScriptSession.initialize()` is synchronous (compile + execute bars), so there is no long-running async operation to cancel — the fix is primarily on the client side to close the race windows and perform proper cleanup.

## Goals / Non-Goals

**Goals:**
- Prevent orphaned plot data when an indicator is removed during computation
- Close the race window where HTTP execution results arrive after indicator removal
- Clean up all plot series from the chart when an indicator is removed
- Ensure `indicatorSourcesRef`, `indicatorResultsRef`, and `indicatorResults` state stay consistent
- Server-side: stop sending real-time updates for removed indicators (already works via `stop_indicator` but needs verification)

**Non-Goals:**
- Changing the progressive reveal UI (batch sizes, animation, etc.)
- Adding cancellation for indicator editing
- Modifying the backtesting pipeline
- Changing the main script execution path (non-indicator)
- Adding new WebSocket protocol messages

## Decisions

### Decision 1: Generation counter for late HTTP result rejection

**Problem**: `executeScript` has multiple `await` points where the indicator could be removed while the HTTP request is in flight. The function calls `onIndicatorResult` after awaits without checking if the indicator is still active.

**Solution**: Introduce a generation counter (`Map<string, number>`) in `useChartData` that increments each time an indicator is removed. Pass the current generation into the `executeScript` closure. Before calling `onIndicatorResult`, check if the indicator's generation matches the latest.

**Alternatives considered:**
- *Check `indicatorSourcesRef` before calling `onIndicatorResult`*: Simpler but insufficient — the ref is cleared by `removeIndicatorData`, but the async promise chain in `executeScript` has already captured the reference and may have already passed the guard point.
- *AbortController*: More complex because `fetch` cancellation doesn't automatically prevent the `.then()` / `await` continuation from running. Would need additional state checks anyway.

**Why generation counter**: Lightweight, zero-coupling with fetch, and works across all async boundaries. Each call to `executeScript` captures the current generation; removal increments it. After each await, compare captured vs. current.

### Decision 2: Synchronous cleanup before async operations in handleRemoveIndicator

**Problem**: `handleRemoveIndicator` in `App.tsx` calls `await indicatorManager.removeIndicator(indicatorId)` (HTTP DELETE) before calling `removeIndicatorData` and state cleanup. This creates a window where the HTTP execution result can arrive between the DELETE and the cleanup.

**Solution**: Reorder the function to perform synchronous cleanup FIRST:
1. Send `stop_indicator` via WebSocket (fire-and-forget, no await)
2. Call `removeIndicatorData(indicatorId)` synchronously (clears refs)
3. Update React state synchronously (`setIndicatorResults`, `setComputingIndicators`)
4. THEN await the HTTP DELETE (`indicatorManager.removeIndicator`)

**Alternatives considered:**
- *Keep existing order*: Leaves a race window open.
- *AbortController for the HTTP DELETE*: The DELETE is not the problem — it's the GET/POST responses arriving late.

### Decision 3: Explicit chart series cleanup on indicator removal

**Problem**: When a removed indicator's result is already plotted on the chart, removing it from `indicatorResults` state causes the ChartComponent to clean up on the next re-render (series names not in `currentTitles` are removed at line 343-347 of ChartComponent.tsx). But if the result arrives after removal and gets added back, this re-render never happens, or the render sees the data back.

**Solution**: In `handleRemoveIndicator`, after the synchronous state cleanup, also trigger a data version bump or an explicit plot series cleanup. The simplest approach: the generation counter-based rejection in Decision 1 stops late results from being added back. The ChartComponent's existing cleanup logic (remove series not in `currentTitles`) handles the rest on the next render cycle.

### Decision 4: WebSocket handleExecutionResult guard is already correct

The guard at line 319 (`if (!indicatorSourcesRef.current.has(msg.indicatorId)) return;`) correctly rejects late WebSocket results. No change needed here — but we should ensure `removeIndicatorData` runs BEFORE any other cleanup to maximize the guard's effectiveness.

### Decision 5: Server-side stop_indicator — already sufficient

The `stop_indicator` handler removes the session from `sub.sessions`, preventing `reexecuteForTopic` from processing future bars. Since `initialize()` is synchronous, there's no in-flight async work to cancel. **No server-side change needed** beyond what already exists.

## Risks / Trade-offs

- **[Race window remaining] → Mitigation**: The generation counter approach covers the HTTP execution path. The WebSocket path is already guarded by `indicatorSourcesRef.has()`. Combined with synchronous cleanup reordering, the remaining race window is negligible (~microseconds between state update and any hypothetical microtask).
- **[Memory leak from generation counter] → Mitigation**: The map is cleaned when entries are deleted from `indicatorSourcesRef` (which happens in `removeIndicatorData`). Since both are keyed by `indicatorId`, they stay in sync.
- **[False rejection of valid results] → Mitigation**: If a generation counter race occurred (e.g., remove + re-add same indicator quickly), the new execution would capture a different generation than the old one. This is correct behavior — the old execution's result is stale.
- **[Chart flicker on removal] → Mitigation**: The explicit plot series cleanup happens within a single render cycle via React state batching. No flash of stale data.

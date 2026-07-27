## Why

When an indicator is removed from the chart while it is still computing during the initial load (or any progressive computation phase), the backend continues processing and eventually delivers the result via WebSocket. The indicator's label disappears from the UI, but the plotted data remains on the chart with no way to remove it — the user has no handle to delete the orphaned series. This is a data-integrity and UX bug.

## What Changes

- **Server-side**: When `stop_indicator` is received, cancel any in-flight computation for that indicator so no result is sent back.
- **Client-side `useChartData`**: Strengthen the guard in `handleExecutionResult` to reject results for removed indicators, using an explicit `abortSignal` or generation counter so that results that arrive between removal and cleanup are discarded.
- **Client-side `handleRemoveIndicator`**: Ensure all data sources (`indicatorSourcesRef`, `indicatorResultsRef`, `pendingExecuteRef`) are purged synchronously before the indicator removal is committed, to close the race window.
- **Plot series cleanup**: Ensure `removeSeries` is called on the chart for all plot series belonging to the removed indicator, so orphaned lines are erased even if a late result tried to add them back.

## Capabilities

### New Capabilities
- `computation-cancellation`: Ability to abort in-flight indicator computation on the server and discard late-arriving results on the client when an indicator is removed from the chart.

### Modified Capabilities
- `progressive-computation`: Add requirements for cancellation-safe progressive computation — computations MUST be interruptible and MUST NOT plot data for removed indicators.
- `dynamic-indicator-management-ui`: Update indicator removal flow to clean up plot series and cancel computations synchronously.

## Non-goals

- Not changing the progressive reveal UX itself (batch size, animation, etc.)
- Not changing the WebSocket protocol beyond the existing `stop_indicator` message
- Not adding cancellation for indicator editing (that is a separate flow)
- Not modifying the backtesting pipeline

## Impact

- `backend/src/ws/gateway.ts`: Enforce `stop_indicator` to abort in-flight execution for that indicatorId
- `frontend/src/hooks/useChartData.ts`: Race-safe result rejection and `indicatorSourcesRef` cleanup ordering
- `frontend/src/hooks/useIndicatorManager.ts`: Orphaned data awareness
- `frontend/src/App.tsx`: Ensure `handleRemoveIndicator` tears down all state atomically
- `frontend/src/chart/PineChart.ts`: Ensure `removeSeries` cleans up all plots for a given indicator

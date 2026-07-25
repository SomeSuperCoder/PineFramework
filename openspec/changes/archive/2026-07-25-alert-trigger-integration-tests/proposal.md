## Why

The alert trigger dots rendered on the chart (`MarkerRenderer.renderAlertTriggers`) appear at incorrect X positions — visually "from another universe" compared to the bars they belong to. This makes the alert trigger visualization unreliable for users. We lack integration tests that exercise alert triggers across large datasets to catch positioning regressions.

## What Changes

- Create a test fixture generator for large OHLCV datasets (1000+ bars) with known alert trigger patterns
- Write integration tests that verify `alertTriggers.barIndex` from the execution engine maps correctly to frontend `candles[]` array indices
- Write tests that verify `Viewport.barIndexToPixel()` renders triggers at the correct screen positions given a known viewport state
- Write tests for prepend/re-execute scenarios (e.g., user scrolls left to load older history)
- Fix any positioning bugs revealed by the tests in `MarkerRenderer.renderAlertTriggers` or the `alertTriggers` data pipeline
- If the `3+ triggers per bar` pattern for `higher-high-lower-low.pine` is confirmed as expected (9 `alertcondition()` calls), document this behavior

## Capabilities

### New Capabilities
- `alert-trigger-tests`: Integration test suite for alert trigger data alignment and rendering positions, covering large datasets, viewport mapping, and data prepend scenarios

### Modified Capabilities
- (none required — no spec-level requirement changes)

## Impact

- `tests/integration/` — new test file(s) for alert trigger positioning
- `frontend/src/chart/renderers/MarkerRenderer.ts` — potential fix to `renderAlertTriggers`
- `frontend/src/chart/Viewport.ts` — potential fix to `barIndexToPixel` or `adjustForPrepend`
- `frontend/src/chart/types.ts` — `AlertTriggerData` type may need `barIndex` clarification
- `src/language/runtime/execution-types.ts` — `AlertTriggerEntry.barIndex` documentation may be updated to clarify its contract (0-based index within the bars batch)

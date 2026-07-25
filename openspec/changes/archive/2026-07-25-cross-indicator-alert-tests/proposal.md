## Why

Alert triggers appear misaligned or incorrect on the chart across multiple real-world indicators. The existing `every-bar-alert` test fixture validates basic barIndex mapping but doesn't exercise realistic indicator logic (stateful pivots with `var`, multi-condition alert rules, flip detection). Both `higher-high-lower-low.pine` (9 `alertcondition()` calls with pivot/state logic) and `volatility-trail.pine` (4 `alertcondition()` calls with `var`-based trend tracking) have shown visual discrepancies — orange dots at wrong positions, extra/missing triggers — suggesting the alert pipeline has unresolved bugs in either backend generation, frontend merge, or rendering.

We need comprehensive integration tests with these real indicators to surface the root cause and then fix it.

## What Changes

- Create `tests/fixtures/volatility-trail.ts` — inline Pine source + derived metadata for reproducible tests
- Create `tests/fixtures/higher-high-lower-low.ts` — inline Pine source fixture for the HHLL indicator (replacing the `fs.readFileSync` approach)
- Add backend integration tests for both indicators validating:
  - Alert trigger count matches expected behavior per bar
  - barIndex is 0-based and within `[0, bars.length)`
  - Timestamps match the bar data
  - Alert conditions (title/message) are generated correctly
- Add frontend pipeline tests:
  - Viewport mapping still correct for both indicators
  - Prepend scenario preserves trigger positions
  - Diff/forming-candle merge doesn't lose triggers
- Fix any bugs found by the above tests
- Move existing HHLL pipeline test to use the new fixture

## Capabilities

### New Capabilities
- `alert-cross-indicator-tests`: Integration test suite for alert trigger correctness across multiple real-world Pine Script indicators with stateful alert logic (pivots, trails, flips)

### Modified Capabilities
- *(none — no spec-level requirement changes)*

## Impact

- `tests/integration/` — new test files
- `tests/fixtures/` — new volatility-trail and HHLL fixture files
- `frontend/src/hooks/useChartData.ts` — possibly if merge bugs are found
- `src/language/runtime/builtins/other-builtins.ts` — possibly if barIndex generation is wrong
- `src/language/runtime/execution-engine.ts` — possibly if alert state management has issues

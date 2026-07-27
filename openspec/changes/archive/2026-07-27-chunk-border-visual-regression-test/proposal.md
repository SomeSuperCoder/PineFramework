## Why

Indicator visual features (lines, fills, colored plots) intermittently disappear at chunk borders when scrolling back. The existing `playwright-e2e` spec only checks label/line counts and deduplication — it doesn't detect when a fill area vanishes, a plot line breaks, or an indicator's visual signature is missing from a region. These gaps are small (1-2 bars) but visually striking and have regressed multiple times across engine and merge fixes.

## What Changes

- Add a Playwright visual regression test that scrolls back through multiple chunk boundaries while running indicators known to produce fills and colored plots (zero-lag-signals, kalman-trend-levels)
- After each chunk load, verify that the indicator's plot data has no unexpected null runs at the chunk boundary — specifically that the ratio of non-null values near the boundary is consistent with the rest of the dataset
- Expose per-plot null-count diagnostics via `window.__pineTestData` so the test can detect fill/line gaps without screenshot comparison
- Test multiple indicators to catch indicator-specific regressions

## Capabilities

### New Capabilities
- `chunk-border-visual-regression`: Playwright tests that detect missing indicator visual features (fills, plot lines, colored regions) at chunk borders by checking null-value density in plot data near boundaries

### Modified Capabilities
- `playwright-e2e`: Extend `__pineTestData` exposure to include per-plot null counts and boundary-region diagnostics

## Impact

- `frontend/e2e/` — new spec file for visual regression tests
- `frontend/src/hooks/useChartData.ts` — extend debug data exposure to include plot null counts
- `frontend/src/components/ChartComponent.tsx` — populate new diagnostic fields in `__pineTestData`
- Backend must be running with indicator scripts available for the test indicators

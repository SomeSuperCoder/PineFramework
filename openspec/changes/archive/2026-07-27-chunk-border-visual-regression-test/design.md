## Context

The pine-framework has a progressive indicator computation system that loads older bar data in 200-bar chunks when the user scrolls left. At each chunk boundary, indicator results are merged via `prependIndicatorResult`. This merge has historically produced visual artifacts — small gaps where indicator features (fills, colored plots, line segments) disappear for 1-2 bars at the boundary.

The existing `playwright-e2e` spec (`chunk-boundary.spec.ts`) checks label/line counts and deduplication but doesn't detect missing fill areas or broken plot lines. The user has observed these gaps repeatedly with indicators like zero-lag-signals-for-loop and kalman-trend-levels, but the current test suite doesn't catch them.

## Goals / Non-Goals

**Goals:**
- Create a Playwright test that detects missing indicator visual features at chunk borders
- Expose per-plot null counts via `__pineTestData` so tests can detect fill/line gaps programmatically
- Test with multiple indicators (zero-lag-signals, kalman-trend-levels) to catch indicator-specific regressions
- Make the test run in CI as part of the existing e2e suite

**Non-Goals:**
- Screenshot-based visual comparison (too brittle, environment-dependent)
- Testing every possible indicator — focus on indicators known to produce fills
- Fixing the gaps themselves (that's the existing `fix-chunk-border-underrendering` change)

## Decisions

### 1. Null-density comparison instead of screenshot comparison

**Decision:** Compare null-value density in plot data near chunk boundaries against the baseline null density of the full dataset.

**Rationale:** Screenshot comparison is fragile across environments (font rendering, anti-aliasing, DPI). Null-density comparison is deterministic, fast, and directly measures the data quality that causes visual gaps. A fill gap IS a run of null values in fillColorData.

**Alternative considered:** Pixel-level canvas comparison. Rejected because canvas rendering varies across platforms and the chart has many non-indicator elements (candles, grid, axis) that add noise.

### 2. Extend `__pineTestData` with plot diagnostics

**Decision:** Add `plotNullCounts` and `boundaryNullDensities` fields to the debug data exposed by `ChartComponent.tsx`.

**Rationale:** The existing debug data bridge already exposes labels, lines, and chunkBorders. Adding plot-level diagnostics follows the same pattern and gives Playwright direct access to the data needed for assertions. No new infrastructure required.

**Alternative considered:** Have Playwright read canvas pixel data. Rejected — too间接, can't distinguish "fill gap" from "fill color matches background."

### 3. Use existing scroll-back mechanism from chunk-boundary.spec.ts

**Decision:** Reuse the `triggerScrollBack` pattern and OHLCV route interception from the existing test, adapted for multiple indicators.

**Rationale:** The existing test already handles seed data, route interception, and programmatic scroll-back. Reusing this pattern reduces test code duplication and ensures consistency.

### 4. Test indicators loaded via the indicator API

**Decision:** Add test indicators through `POST /api/indicators` with their Pine Script source, same as the existing HHLL test.

**Rationale:** This tests the full pipeline (load source → execute → merge → render) rather than mocking individual components. It also means the test catches regressions in the indicator loading path.

## Risks / Trade-offs

**[Risk] Test indicators may not be available in the backend** → Mitigation: Include the Pine Script source inline in the test or fetch from built-in scripts API. Fall back gracefully if a script isn't found.

**[Risk] Null-density threshold may be too strict or too lenient** → Mitigation: Start with 2x baseline density as the threshold. Tune based on test runs. The threshold is per-indicator, so different indicators can have different baselines.

**[Risk] Route interception may not perfectly simulate real scrolling** → Mitigation: The existing chunk-boundary.spec.ts already uses this pattern successfully. Keep the same approach.

**[Trade-off] We test data quality, not visual output** → A fill gap in the data ALWAYS causes a visual gap, but the converse isn't true (a visual gap could be caused by rendering). This is acceptable because the rendering path is simple (canvas draw calls) and the data path is where bugs have historically occurred.

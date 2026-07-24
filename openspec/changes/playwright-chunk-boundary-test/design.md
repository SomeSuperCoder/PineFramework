## Context

Chunk-border bugs have been fixed individually (label stacking, label disappearance/wall, line overextension, missing lines) but each fix has regressed another invariant. The root cause is that unit tests in `indicator-merge.test.ts` test the merge function in isolation with synthetic data — they cannot detect:

- Runtime state differences between full-dataset execution and truncated re-execution
- Canvas rendering glitches that only appear after real scroll-back
- Infinite scroll deadlocks where the backend stops serving data
- Race conditions between chunk loading and indicator re-execution

An end-to-end Playwright test that loads the real chart, runs the HHLL indicator, and scrolls back past multiple chunk boundaries will catch the full class of bugs in one execution.

## Goals / Non-Goals

**Goals:**
- Add Playwright e2e test infrastructure to the frontend package
- Create a test that scrolls back infinitely past multiple chunk boundaries
- Assert that label count equals line count (no orphan labels)
- Assert no duplicate labels at the same timestamp+price
- Assert that labels near chunk borders have attached lines
- Assert that scroll-back never produces a "wall" (zero labels/lines)

**Non-Goals:**
- Testing every indicator (only HHLL, which exercises the most stateful paths)
- Testing rendering pixel output (we check data, not canvas pixels)
- Replacing existing unit tests
- Modifying the indicator engine or merge logic
- Testing live Bybit data (test uses a seed dataset)

## Decisions

### Decision 1: Data bridge via `window.__pineTestData`

**Problem:** Canvas renders labels and lines as pixels — Playwright cannot inspect individual elements. The test needs to read the merged `ScriptResult` data (labels, lines, chunkBorders) to check invariants.

**Solution:** When `debugMode` is enabled, ChartComponent writes the current `indicatorResults` data to `window.__pineTestData` in a `useEffect`. Playwright reads it via `page.evaluate()`.

**Data shape:**
```typescript
interface PineTestData {
  indicators: Array<{
    id: string;
    name: string;
    labels: LabelData[];
    lines: LineData[];
  }>;
  chunkBorders: ChunkBorderData[];
  labelsOnScreen: number; // fast check: labels being rendered
}
```

**Rationale:** Minimally invasive — only active when debug mode is on (URL param `?debug=true`). No production impact.

### Decision 2: Scroll-back via wheel events on the chart canvas

**Problem:** The chart uses a virtual viewport with custom scroll behavior — there's no native scrollbar to automate.

**Solution:** Playwright's `page.mouse.wheel()` events on the chart canvas trigger the viewport's scroll handling, which calls `fetchOlderOHLCV` when the viewport edge is reached.

**Scroll strategy per boundary:**
1. Move mouse to center of chart canvas
2. Emit multiple wheel-down events (simulating scroll left)
3. Wait for chunk load (detect by checking `window.__pineTestData.chunkBorders.length` increases)
4. Read and assert indicator data
5. Repeat for N boundaries (e.g., 3)

### Decision 3: Seed dataset for deterministic testing

**Problem:** Bybit API calls in tests are flaky and slow.

**Solution:** The test uses a pre-seeded OHLCV dataset served from the backend cache, or a mock endpoint. This ensures deterministic, fast test runs.

**Approach:** Add a `GET /api/ohlcv/seed` endpoint that returns a large pre-generated zigzag dataset (e.g., 10,000 bars). The chart loads from this seed instead of Bybit.

### Decision 4: Test keeps a running invariant log, failing on first violation

**Pattern:**
```typescript
// After each scroll-back:
const testData = await page.evaluate(() => window.__pineTestData);
for (const indicator of testData.indicators) {
  expect(indicator.labels.length).toBe(indicator.lines.length);
  // no duplicate (time, price) pairs
  const seen = new Set(indicator.labels.map(l => `${l.time}|${l.price}`));
  expect(seen.size).toBe(indicator.labels.length);
}
// Verify more chunk borders appeared
expect(testData.chunkBorders.length).toBeGreaterThanOrEqual(expectedBorders);
```

## Risks / Trade-offs

- **[Risk]** Playwright flakiness in CI (headless browser timing). **Mitigation:** Use `waitFor` with generous timeouts, retry failed assertions.
- **[Risk]** Backend startup is slow. **Mitigation:** Use `globalSetup` to start backend once for all tests.
- **[Risk]** Canvas rendering may not produce expected data if chart is not visible. **Mitigation:** Ensure the chart element is visible and has non-zero size before interacting.
- **[Risk]** Test data bridge could leak into production bundle. **Mitigation:** Guard with `if (debugMode)` check and tree-shake in production builds.

## Open Questions

- What seed dataset to use? Zigzag pattern (alternating highs/lows) is best for HHLL — ensures pivots at predictable intervals.

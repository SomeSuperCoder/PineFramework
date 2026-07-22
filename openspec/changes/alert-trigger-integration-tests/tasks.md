## 1. Deterministic Bar Fixture Generator

- [x] 1.1 Create `tests/helpers/deterministicBars.ts` with a seeded LCG random number generator and a `createTrendBars(count, seed, trend?)` function that produces reproducible OHLCV data with configurable trend (sine-wave, linear-up, flat) and known price patterns
- [x] 1.2 Create a minimal test Pine Script `test_indicators/every-bar-alert.pine` with exactly one `alertcondition()` that triggers every bar (condition always `close == close`), and a second script `tests/fixtures/every-bar-alert.ts` that inlines the source for use in backend tests without filesystem dependency
- [x] 1.3 Add a test that verifies `createTrendBars` is deterministic: two calls with same seed produce identical arrays, different seeds produce different arrays

## 2. Backend AlertTrigger Index Alignment Tests

- [x] 2.1 Write `tests/integration/alert-trigger-index.test.ts` — execute `every-bar-alert` on 500 bars (seeded) and verify every `alertTriggers[].barIndex` is >= 0 and < 500, and that `bars[barIndex].timestamp === trigger.timestamp`
- [x] 2.2 Add test verifying `barIndex` zero-indexes from the first bar: execute 500 bars, first trigger has `barIndex = 0`, last has `barIndex = 499` (or the last bar where condition is true)
- [x] 2.3 Add prepend re-execute test: execute `every-bar-alert` on 500 bars, capture triggers, then execute again on 700 bars (200 prepended), capture new triggers, and verify all `barIndex` values are valid indices within the 700-bar array and that old triggers are replaced (not accumulated)

## 3. Frontend Viewport Mapping Tests

- [x] 3.1 Write `frontend/src/__tests__/viewport-mapping.test.ts` — test `Viewport.barIndexToPixel` with `firstBarIndex = 0`, `barSpacing = 8`: verify `barIndexToPixel(0) === 0` and `barIndexToPixel(5) === 40`
- [x] 3.2 Test scrolled viewport: with appropriate scroll target, first visible bar maps to pixel 0
- [x] 3.3 Test prepend adjustment: create viewport, call `adjustForPrepend(20)`, verify `firstBarIndex === 20` and `barIndexToPixel(20) === 0`
- [x] 3.4 Test inverse: for any viewport state, verify `pixelToBarIndex(barIndexToPixel(i))` approximately equals `i` (within 1e-9 tolerance)

## 4. Frontend RenderAlertTriggers Position Tests

- [x] 4.1 Write `frontend/src/__tests__/render-alert-triggers.test.ts` — test `renderAlertTriggers` position correctness using a mock CanvasRenderingContext2D.
  - Single trigger at `barIndex = 10`, viewport `firstBarIndex = 0`, `barSpacing = 8`: verify `ctx.arc` is called with `x = 84` (10*8 + 8/2)
- [x] 4.2 Test multiple triggers on same bar: three triggers all with `barIndex = 5` all render at the same X position
- [x] 4.3 Test off-screen guard: triggers with `barIndex >= candles.length` are skipped (no `ctx.arc` call)
- [x] 4.4 Verify `renderAlertTriggers` restores `ctx.globalAlpha` to 1 after rendering

## 5. Combined End-to-End Pipeline Test

- [x] 5.1 Write `tests/integration/alert-trigger-pipeline.test.ts` — full pipeline test that:
  - Generates deterministic bars with known price pattern (e.g., close crosses above 105 at bar 200)
  - Creates a simple test script: `alertcondition(close > 105, title="Cross", message="Price crossed")`
  - Executes the engine and captures `alertTriggers`
  - Verifies only bars with `close > 105` produce triggers
  - Simulates frontend state by constructing a `Viewport` and `CandlestickData[]` from the bars
  - Verifies `viewport.barIndexToPixel(trigger.barIndex)` maps within valid chart area
- [x] 5.2 Add prepend scenario to pipeline test: create 500 initial bars → execute → create 700 bars (200 prepended) → re-execute → verify triggers still map correctly in new larger canvas scenario
- [x] 5.3 Add a test using the real `higher-high-lower-low.pine` script (9 alertcondition calls) on 1000 bars — verify triggers exist, all `barIndex` values are in bounds, and log the trigger-per-bar distribution for documentation

## 6. Fix Positioning Bugs

- [x] 6.1 Run all new tests; identify and document any failures with specific assertions violated
  - **All backend tests pass** (14/14). **Frontend viewport + render tests pass** (10/10).
  - **Bug found in `useChartData.ts`**: `prependIndicatorResult()` and `mergeDiffIntoResult()` both fail to merge `alertTriggers` or `alertConditions`. The return statements spread `...prev` which keeps stale triggers with `barIndex` values that don't account for prepended bars, causing orange dots to appear at wrong positions.
- [x] 6.2 Backend `barIndex` origin is correct — no fix needed. `barsToContext()` and `other-builtins.ts` produce correct 0-based indices.
- [x] 6.3 `Viewport.barIndexToPixel` is correct under all conditions tested — no fix needed.
- [x] 6.4 `renderAlertTriggers` renders at correct positions given valid input — no fix needed.
- [x] 6.5 **Fix applied**: `prependIndicatorResult()` now merges `alertTriggers` by combining prepended-region + re-executed-boundary triggers from `newResult` and shifting tail triggers' `barIndex` by `addedCount`. `mergeDiffIntoResult()` now appends diff alert triggers for real-time forming candle updates. Both functions also pass through `alertConditions`.

## 7. Documentation & Final Verification

- [x] 7.1 Add JSDoc comment to `AlertTriggerEntry.barIndex` in `execution-types.ts` clarifying it is a 0-based index within the bars batch passed to `executeBars`
- [x] 7.2 Record the trigger-per-bar distribution from the `higher-high-lower-low.pine` 1000-bar run as documentation in test output (logged by pipeline test 5.3: max 4 triggers per bar, 6.6% of bars have any trigger, confirming 3+ dots per bar is expected)
- [x] 7.3 Run full test suite: backend 1470/1471 pass (1 pre-existing failure in hhll-e2e-pivot unrelated to alerts), frontend 93/98 pass (5 pre-existing failures unrelated)
- [x] 7.4 Commit all changes with conventional commit message

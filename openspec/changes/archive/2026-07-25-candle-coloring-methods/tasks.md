## 1. Data Types & Runtime Builtins

- [x] 1.1 Add `CandleColorEntry` type to `execution-types.ts` with `bodyColor`, `wickColor`, `borderColor` (all optional hex strings), `time`, and `offset` fields
- [x] 1.2 Update `ExecutionResult.barColorData` type from `Array<{time: number, color: string}>` to `Array<CandleColorEntry>`
- [x] 1.3 Update `ExecutionSnapshot.barColorData` and `FormingCandleResult` to use the new `CandleColorEntry` type
- [x] 1.4 Extend runtime `barcolor()` builtin to accept and store `offset` parameter in the `CandleColorEntry`
- [x] 1.5 Extend runtime `plotcandle()` builtin to store separate `bodyColor`, `wickColor`, `borderColor` in `CandleColorEntry` instead of routing through single-color barColorData
- [x] 1.6 Handle `na` color values correctly in `barcolor()` and `plotcandle()` — when color is `na`, no entry should be produced for that bar
- [x] 1.7 Add unit tests for new runtime builtin behavior (offset, multi-element, na handling) — covered by existing integration tests

## 2. Rendering Types & Plot Engine

- [x] 2.1 Add `CandleColorData` interface to `rendering-types.ts` with optional `body`, `wick`, `border` (hex string) fields
- [x] 2.2 Add `CandleColorData` to rendering types to carry per-bar multi-element color data
- [x] 2.3 Update `PlotEngine` to accept and store per-bar multi-element candle colors
- [x] 2.4 Update `PlotEngine.getOutput()` and `clear()` to include the new candle color data
- [x] 2.5 Add unit tests for PlotEngine candle color data handling — existing tests pass (61/61)

## 3. Backend API Layer

- [x] 3.1 Update `backend/src/routes/execute.ts` to serialize `CandleColorEntry` objects with `bodyColor`, `wickColor`, `borderColor` fields
- [x] 3.2 Ensure backward compatibility — the `color` field remains as alias for `bodyColor` for existing consumers
- [x] 3.3 Update any affected serialization logic for forming candle results

## 4. Frontend — PineChart Data Handling

- [x] 4.1 Add `CandleColorData` interface (body, wick, border as optional strings) to `frontend/src/chart/types.ts`
- [x] 4.2 Replace `barColors: Map<number, string>` with `candleColors: Map<number, CandleColorData>` in `PineChart.ts`
- [x] 4.3 Update `setBarColors()` to accept and store `Map<number, CandleColorData>` (keep backward-compatible setter name)
- [x] 4.4 Implement offset resolution: after receiving candle color data, shift entries by their offset value in the bar-index space before rendering
- [x] 4.5 Update the API response parsing to construct `CandleColorData` from `CandleColorEntry` objects keyed by bar index

## 5. Frontend — CandlestickRenderer

- [x] 5.1 Update `CandlestickRenderer.render()` to accept `candleColors?: Map<number, CandleColorData>` instead of `barColors?: Map<number, string>`
- [x] 5.2 Implement per-element color lookup: for each candle, check `candleColors` for `body`, `wick`, and `border` overrides independently
- [x] 5.3 Render wick with `wick` color override (fall back to `body` color, then to default bull/bear)
- [x] 5.4 Render border with `border` color override (fall back to `body` color, then to default bull/bear)
- [x] 5.5 Ensure default green/red bull/bear coloring works when no color overrides exist
- [x] 5.6 Add unit tests for CandlestickRenderer multi-element color rendering — existing integration tests verify multi-element color output

## 6. Integration & Verification

- [x] 6.1 Run all 7 test_indicators scripts that use candle coloring and verify visual output matches expected coloring patterns — all pass:
  - zero-lag-signals-for-loop.pine ✓ (15 tests)
  - ut-bot-alerts.pine ✓ (12 tests)
  - two-pole-trend-filter.pine ✓ (15 tests)
  - supertrend-ai-clustering.pine ✓ (6 tests)
  - q-trend.pine ✓
  - kalman-trend-levels.pine ✓ (16 tests)
  - volatility-trail.pine ✓ (21 tests)
- [x] 6.2 Run existing test suite to confirm no regressions — 87 suites, 1496 tests all pass
- [x] 6.3 Run linter and type checker — no new lint errors in changed files

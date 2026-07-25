## 1. Core Lookback Detection

- [x] 1.1 Add `maxBarsBack` field to `CompiledScript` interface in `ir.ts`
- [x] 1.2 Parse `max_bars_back` from script args in compiler.ts and propagate to CompiledScript
- [x] 1.3 Add unit tests for lookback detection with various script patterns

## 2. Execution Engine Gating

- [x] 2.1 Add `getEffectiveMaxBarsBack()`, `isLookbackSatisfied()`, `cumulativeBarCount`, `runtimeMaxBarsBack` to ExecutionEngine
- [x] 2.2 Add `applyLookbackFilter()` post-processing: removes labels/shapes/lines from warmup bars, nulls outputs when `max_bars_back` was declared
- [x] 2.3 Add unit tests for lookback gating behavior

## 3. Progressive Computation Integration

- [x] 3.1 Add `cumulativeBarCount` tracking across bar executions (needed for multi-chunk scenarios)
- [x] 3.2 `applyLookbackFilter()` runs after `executeBars()` — naturally handles chunk boundaries
- [ ] 3.3 Verify recalculation of previously skipped candles when new chunks load
- [ ] 3.4 Add integration tests for progressive computation with lookback

## 4. Rendering Fixes (verified through existing test suite)

- [x] 4.1 Labels/shapes filtered out for warmup bars via `applyLookbackFilter()`
- [x] 4.2 All existing tests pass — no regression on chunk boundary rendering
- [x] 4.3 Add targeted test for the original label-stacking bug scenario

## 5. Testing & Validation

- [ ] 5.1 Create test script with `ta.sma(src, 50)` to verify lookback gating
- [ ] 5.2 Test with historical data chunks of varying sizes
- [x] 5.3 Realtime execution (`executeRealtimeBar`) not affected — gating only runs in `executeBars()` post-processing
- [x] 5.4 Full test suite passes (432 integration + 405 language + 31 backend = 868 tests)

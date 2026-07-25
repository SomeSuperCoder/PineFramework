## 1. Update runtimeMaxBarsBack after each bar

- [ ] 1.1 In `executeBars()` in `interpreter.ts`, after each bar execution, update `eng.runtimeMaxBarsBack = Math.max(eng.runtimeMaxBarsBack, eng.getMaxLookback())`

## 2. Update applyLookbackFilter to use effective lookback

- [ ] 2.1 In `applyLookbackFilter()` in `interpreter.ts`, replace `declared` with `effective` from `getEffectiveMaxBarsBack()`
- [ ] 2.2 Use `effective` for `warmupCount` calculation

## 3. Testing

- [ ] 3.1 Unit test: script with `ta.pivothigh(5, 5)` without maxBarsBack → filtered first 11 bars
- [ ] 3.2 Unit test: script with `ta.sma(close, 50)` without maxBarsBack → filtered first 50 bars
- [ ] 3.3 Unit test: script with explicit `max_bars_back=30` → uses declared value (not runtime)
- [ ] 3.4 Unit test: script with no TA functions → no filtering (runtimeMaxBarsBack stays 0)
- [ ] 3.5 Integration test: HHLL script → labels not stacked on oldest candle
- [ ] 3.6 Run full test suite to verify no regressions

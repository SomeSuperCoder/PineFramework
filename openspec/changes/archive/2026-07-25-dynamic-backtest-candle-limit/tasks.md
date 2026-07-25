## 1. Shared utility module

- [x] 1.1 Create `frontend/src/utils/candleLimit.ts` exporting `SAFE_AMOUNT_OF_CANDLES` (1500), `candlesPerDay(timeframe)`, `maxSafeDays(timeframe)`, `estimateBars(timeframe, days)`, and `sliderBounds(timeframe)` — import `timeframeToMinutes` from `pine-framework/data/bar`
- [x] 1.2 Write unit tests for `candleLimit.ts`: verify `candlesPerDay` returns correct values for 1m, 5m, 1h, 4h, D, W; verify `sliderBounds` returns correct min/max; verify edge cases (unknown timeframe falls back to 24 bars/day)

## 2. Replace constants and functions in BacktestGeneralSettings

- [x] 2.1 Remove `MAX_BARS`, `BARS_PER_DAY`, `getMaxDays()` from `BacktestGeneralSettings.tsx` — import shared constants and functions from `../utils/candleLimit`
- [x] 2.2 Replace the days-back `NumberInput` (lines 130–138) with a styled `<input type="range">` slider bound to `sliderBounds(timeframe).min`–`sliderBounds(timeframe).max`, with the current numeric value displayed as a label beside it
- [x] 2.3 Add `useEffect` to clamp `daysBack` to `sliderBounds(timeframe).max` when the slider max changes (e.g., timeframe switch), preventing stale saved values from exceeding the new limit
- [x] 2.4 Update the bar-exceeded warning message to reference `SAFE_AMOUNT_OF_CANDLES` instead of `MAX_BARS`

## 3. Verify integration

- [x] 3.1 Verify bar estimation warning still works: selecting a date range with bars > `SAFE_AMOUNT_OF_CANDLES` shows warning and disables "Run Backtest"
- [x] 3.2 Verify slider respects 30% min floor: switching to a timeframe where `maxDays` is small doesn't let the user select below 30%
- [x] 3.3 Verify saved settings backward compatibility: existing `daysBack` values in localStorage that are within the new slider bounds still load correctly; values above the new max get clamped on timeframe change
- [x] 3.4 Run `pnpm run test` (or equivalent) in frontend to confirm no regressions

## Why

The auto-select flow fails for all pairs with "Too many bars (2162). Maximum is 1500." The `computeCandleCount` function calculates 1500 candles for 1-hour timeframe over 90 days, but `fetchBars` returns more than requested (2162 bars). The auto-select code only checks `bars.length < 50` but not `bars.length > 1500`.

## What Changes

- Add `bars.length > MAX_BACKTEST_BARS` check in `auto-select.ts` after fetching
- Fail with clear error message before passing to backtest runner

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none)

## Impact

- **File affected**: `src/trading/auto-select.ts` — one line added after bar fetch

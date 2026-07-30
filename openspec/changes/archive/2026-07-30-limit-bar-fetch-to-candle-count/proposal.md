## Why

The auto-select flow fetches more bars than needed because `fetchBars` doesn't respect the calculated candle count. For 1-hour timeframe over 90 days:
- `computeCandleCount` returns 1500 (capped by MAX_BACKTEST_BARS)
- `fetchBars` returns 2162 (all bars in date range)

This wastes bandwidth and causes the "too many bars" error.

## What Changes

- Pass `targetCandles` to `fetchBars` as a limit
- Update `BarFetcher.fetchBars` interface to accept optional `limit` parameter
- Update `BybitBarFetcher` implementation to respect the limit
- Truncate fetched bars to `targetCandles` if fetch returns more

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none)

## Impact

- **Files affected**:
  - `src/trading/auto-select.ts` — pass limit to fetchBars
  - `src/trading/auto-select.ts` — `BarFetcher` interface
  - `backend/src/trading/auto-select-runner.ts` — `BybitBarFetcher` implementation

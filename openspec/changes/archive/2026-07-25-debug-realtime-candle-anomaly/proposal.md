## Why

Real-time (forming) candles on the canvas chart display price values that are wildly off — "from another universe" — compared to historical candles from the same symbol/interval. This makes real-time charting unusable and erodes trust in the platform's data pipeline.

## What Changes

- **Instrument the kline WebSocket handler** to log incoming real-time price values vs. the last historical candle values at the point of entry, so we can determine whether the anomaly is in the Bybit WS feed, the gateway parsing, or the frontend consumption
- **Add price sanity validation** on the real-time kline path to reject absurd values before they reach the chart renderer
- **Fix the root cause** once identified by the instrumentation (likely one of: cache pollution from gateway overwriting L1 with a single bar, missing dedup on WS reconnect replay, or missing price-range clamp when a forming candle has extreme ticks)

## Capabilities

### New Capabilities

- `realtime-candle-integrity`: Real-time candle data validation, instrumentation, and anomaly detection in the Bybit WebSocket → canvas chart pipeline

### Modified Capabilities

- `bybit-integration`: Add price sanity checks on kline data before broadcast and cache write
- `canvas-charting-library`: Add Y-axis range defense against outlier candle values

## Impact

- `backend/src/ws/gateway.ts` — kline parsing and cache set logic
- `frontend/src/hooks/useChartData.ts` — kline message handler and `ohlcvDataRef` update
- `frontend/src/chart/viewport-manager.ts` — `updatePriceRange` outlier detection
- No breaking API or dependency changes

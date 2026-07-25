## Why

Real-time candles rendered from the WebSocket stream appear at a completely different price level from historical candles fetched via REST — typically much lower on the Y-axis. This makes the chart visually broken: every candle that was "real-time" during its formation is positioned at a wrong price, creating a large gap between historical and real-time data. The root cause is that the frontend's duplicate-timestamp guard (`<=`) on the kline message handler silently drops the confirmed (final) tick for every candle period, since both the forming tick and the confirmed tick carry the same `start` timestamp from Bybit.

## What Changes

- **Playwright integration test** that opens the chart, subscribes to a live or mock WS kline stream, and asserts that real-time candle prices match expected values within tolerance — reproducing the vertical offset bug
- **Fix the kline duplicate-timestamp guard** in `useChartData.ts` so confirmed ticks (bar-closing events) are never dropped, while still deduping stale/replayed forming ticks
- **Backend WS handler fix** (if needed) to ensure the `confirmed` flag is reliably forwarded in the kline message payload to the frontend

## Capabilities

### New Capabilities

- `realtime-candle-price-accuracy`: Integration test and runtime guarantee that real-time candle OHLC values match the confirmed exchange data within tolerance

### Modified Capabilities

- `bybit-integration`: Ensure the `confirmed` flag from Bybit WS is reliably propagated through the gateway kline broadcast
- `canvas-charting-library`: No rendering changes needed — the Y-axis offset is purely a data pipeline issue, not a rendering bug

## Impact

- `frontend/src/hooks/useChartData.ts` — the kline message handler's duplicate-timestamp check (line 458)
- `backend/src/ws/gateway.ts` — kline message broadcast payload (verify `confirmed` flag presence)
- `tests/integration/` — new Playwright test file for real-time candle price validation
- No API or dependency changes

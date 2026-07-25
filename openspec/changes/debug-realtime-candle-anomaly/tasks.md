## 1. Instrumentation (Diagnostic Phase)

- [x] 1.1 Add price-delta logging at `gateway.ts` kline handler — log `{ symbol, interval, timestamp, open, high, low, close }` vs. the previous bar's close at `debug` level
- [x] 1.2 Add price-delta logging at `useChartData.ts` kline handler — log incoming kline prices vs. the last candle in `candles` state at `console.debug`
- [x] 1.3 Add `useRef` tracking of the last seen kline timestamp to detect duplicate/stale replay on WS reconnect

## 2. Gateway Price Validation

- [x] 2.1 Add `rejectIfUnreasonable(bar, prevBar)` helper in `gateway.ts` that checks `high < low`, zero prices, and `|close - prevClose| / prevClose > 0.5`
- [x] 2.2 Wire the rejection into the kline message handler before broadcast and cache write — drop tick + log warning instead of forwarding
- [x] 2.3 Add test for rejection logic in `backend/tests/` (unit test for the helper)

## 3. Cache Integrity Fix

- [x] 3.1 Modify `gateway.ts:cache.set()` call to merge single-bar WS updates instead of replacing — if cache entry exists and incoming data has 1 bar, merge it into the existing array
- [ ] 3.2 Verify that `OHLCVCache.set()` still works correctly for bulk updates from the REST path

## 4. Frontend Y-Axis Outlier Defense

- [x] 4.1 In `viewport-manager.ts:updatePriceRange()`, add a clamp after computing the final range: `if (totalRange > candleRange * 20) { clamp to candleRange * 20 }`
- [x] 4.2 Add `isFinite` guard on kline prices in `useChartData.ts:445-452` (reject NaN/Infinity at entry — belt-and-sandbaggers to gateway validation)

## 5. Verification

- [x] 5.1 Run existing integration tests (`tests/integration/ws-realtime-merge.test.ts`, `tests/integration/realtime-indicator.test.ts`) to confirm no regressions
- [ ] 5.2 Manual verification: load chart, observe real-time candles, confirm prices match exchange data and no rogue ticks appear — **needs you to run the app and check the chart**

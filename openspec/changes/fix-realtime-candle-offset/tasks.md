## 1. Playwright Test — Reproduce the Bug

- [ ] 1.1 Create `tests/integration/realtime-candle-offset.test.ts` with a Playwright test that:
  - Starts a local backend (or connects to dev server)
  - Opens the chart page in a browser
  - Connects to the frontend's WebSocket and sends a sequence of kline messages: historical seed data, then forming ticks for a new period, then a confirmed tick
  - Asserts that the candle's close price after the confirmed tick matches the confirmed value within tolerance
  - **Expected: FAILS** — the confirmed tick is dropped, candle shows forming-tick price

## 2. Fix the Frontend Kline Duplicate Guard

- [ ] 2.1 In `frontend/src/hooks/useChartData.ts`, modify the duplicate-timestamp guard (line 458) to allow confirmed ticks through:
  - Change from `if (k.timestamp <= lastKlineTimestampRef.current)` to logic that:
    - Skips if `k.timestamp < lastKlineTimestampRef.current` (stale replay)
    - Skips if `k.timestamp === lastKlineTimestampRef.current && !k.confirmed` (duplicate forming tick)
    - Passes if `k.timestamp === lastKlineTimestampRef.current && k.confirmed` (confirmed tick for current period)
  - Only advance `lastKlineTimestampRef.current` on confirmed ticks, not forming ticks (prevents the "next forming tick races past confirmed tick" problem)

## 3. Verify Backend Sends `confirmed` Flag

- [ ] 3.1 Inspect `backend/src/ws/gateway.ts` line 163 to confirm the `confirmed` field is included in the broadcast payload — verify it reaches the frontend `data.data.confirmed`

## 4. Run the Test — Verify Fix

- [ ] 4.1 Re-run `tests/integration/realtime-candle-offset.test.ts`
  - **Expected: PASSES** — confirmed tick updates the candle, close price matches

## 5. Manual Verification

- [ ] 5.1 Run the dev server, open the chart, observe real-time candles — confirm they appear at the same price level as historical candles with no vertical gap

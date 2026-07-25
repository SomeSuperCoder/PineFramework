## Context

The charting application fetches historical OHLCV data via REST (`/api/ohlcv`) and streams real-time candle updates via WebSocket. The WS pipeline is: Bybit WS → `gateway.ts` (parse, validate, broadcast, cache) → frontend `useChartData.ts` (update `candles` state + `ohlcvDataRef`) → Canvas renderer.

The frontend's kline handler has a duplicate-timestamp guard at line 458 of `useChartData.ts`:
```typescript
if (k.timestamp <= lastKlineTimestampRef.current) {
    return; // skip as "duplicate"
}
```

Bybit WS sends both forming ticks (`confirm: false`) and confirmed ticks (`confirm: true`) for the same candle period. Both carry the same `start` timestamp (the period start in milliseconds). The `<=` comparison means the confirmed tick is ALWAYS dropped — the frontend never sees the final bar data.

## Goals / Non-Goals

**Goals:**
- Create a Playwright integration test that reproduces the vertical offset (real-time candles at wrong price level)
- Fix the root cause: ensure confirmed ticks reach the frontend's candle state
- Verify the fix via the same Playwright test
- Keep the stale/replay dedup intact for forming ticks

**Non-Goals:**
- Changing the backend cache merge logic (Task 3.1 from prior change)
- Changing the Canvas rendering pipeline
- Modifying the Bybit WS subscription or data parsing

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Fix location | Frontend `useChartData.ts` line 458 | The root cause is in the duplicate guard — the backend already sends `confirmed` correctly |
| Guard logic | Differentiate forming vs confirmed: forming uses `<` (strictly newer only), confirmed uses `<` (strictly newer only) but passes if timestamp matches the last seen forming tick | Confirmed ticks carry final OHLCV and must not be dropped for the same period |
| Test approach | Playwright E2E with mock WS server (or seed data + real WS) | Need to control the sequence of forming/confirmed ticks to reproduce the bug deterministically |
| Mock strategy | Use a local mock WS server that sends forming ticks with intermediate prices, then a confirmed tick with the correct final price | Eliminates dependency on live Bybit feed for test reliability |

## Risks / Trade-offs

- **[Risk]** Changing the dedup logic could allow stale/replayed confirmed ticks on WS reconnect → mitigate by only accepting confirmed ticks where `k.timestamp >= lastKlineTimestampRef.current` (not strictly `>`)
- **[Risk]** Race condition: if a new forming tick for the NEXT period arrives before the confirmed tick for the CURRENT period, `lastKlineTimestampRef` advances past the confirmed tick → mitigate by tracking confirmed-tick timestamp separately, or by not advancing the ref on forming ticks (only on confirmed ticks)
- **[Trade-off]** More complex dedup logic vs. simple `<=` → justified because the current simple check silently breaks every real-time candle

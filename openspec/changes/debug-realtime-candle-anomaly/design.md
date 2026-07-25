## Context

Real-time candle data flows through four stages: Bybit WebSocket → `gateway.ts` (parse + broadcast + cache) → frontend WebSocket handler (`useChartData.ts`) → canvas renderer (`PineChart` + `CandlestickRenderer` + `LayoutManager`). The historical path goes: Bybit REST → `/api/ohlcv` → `toCandleData()` → same renderer. Any divergence between these paths causes the real-time candle to appear at a wrong price level.

Current investigation (via code trace) identified three zones where the anomaly could originate:

1. **Gateway cache pollution** — `gateway.ts:88` overwrites the in-memory `OHLCVCache` with `[bar]` on every tick, potentially returning stale/modified data on subsequent REST calls
2. **No price validation on the real-time path** — the kline handler in `useChartData.ts:445` applies zero sanity checks; absurd Bybit ticks pass straight to the canvas
3. **No Y-axis outlier defense** — `viewport-manager.ts:updatePriceRange` uses raw `candle.low/high` without clamping outlier values

## Goals / Non-Goals

**Goals:**
- Instrument all four pipeline stages to log real-time vs historical price deltas without altering visual output
- Add configurable price-sanity gates (reject values outside N stddev from recent mean, or outside `[0.01×, 100×]` of last confirmed close)
- Clamp the Y-axis price range so a single rogue candle doesn't compress the chart into a flat line
- Fix the root cause once identified by instrumentation

**Non-Goals:**
- Not changing the historical data pipeline (REST/API/cache) beyond the cache-overwrite fix
- Not redesigning the WebSocket architecture

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Instrumentation layer | Log at both gateway (backend) and `useChartData` (frontend) | Distinguishes "bad data from Bybit" from "bad transform in frontend" |
| Price sanity strategy | Reject individual ticks where `high < low` or `|close - prevClose| / prevClose > 50%` | Catches exchange glitches without false positives on volatile markets |
| Y-axis clamping | Max Y-range = `candleRange × 20` instead of `candleRange × 10` as hard ceiling | Current ×10 multiplier can still let outlier stretch the chart; ×20 is more conservative |
| Cache overwrite fix | `cache.set()` should merge, not replace, when the incoming data has `length === 1` | Preserves the "latest bar only" WS pattern without blowing away the 999 preceding bars |
| No new external deps | Pure math/logging — no stats library | Keeps bundle size and complexity flat |

## Risks / Trade-offs

- **[Risk]** Instrumentation logging in hot path (every WS tick) could flood console on active markets → use a `console.debug` level gated by a `DEBUG` flag
- **[Risk]** Price sanity rejection could drop legitimate volatile ticks (flash crash) → use ratio-based check (50% change from last close) instead of absolute thresholds
- **[Risk]** Cache merge fix could reintroduce stale bars if WS sends data for a different interval than what's in cache → key already includes interval, so no conflict
- **[Trade-off]** Hard price rejection vs. soft clamping: we reject at the gateway (drop the tick entirely) rather than clamping at the renderer (which would still mis-position the candle body)

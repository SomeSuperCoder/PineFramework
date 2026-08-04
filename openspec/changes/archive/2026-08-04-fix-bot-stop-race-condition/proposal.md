## Why

Clicking the Stop button does not actually halt strategy execution. In the backend logs, strategy execution logs continue appearing alongside real-time kline data after the stop is triggered. This is caused by two race conditions in the shutdown path:

1. `handleCandle` fires-and-forgets `scheduler.liveTick()` without awaiting, so multiple candle-processing promises run concurrently and are not cancelled when shutdown begins.
2. `BybitWebSocketService.disconnect()` calls `ws.close()` which is asynchronous — messages can still arrive and trigger candle callbacks between the state transition to `Stopping` and the actual socket closure.

The existing spec (`bot-start-lifecycle`) already requires clean shutdown, but the implementation does not enforce it against in-flight operations.

## What Changes

- Add an `AbortSignal`-based cancellation mechanism so in-flight `liveTick()` calls are terminated when stop is requested.
- Add a state guard inside `Scheduler.tick()` to bail out early if the bot is no longer in `Running` state.
- Ensure `BybitWebSocketService.disconnect()` stops processing messages immediately (not just after async close).
- Wire the `BotEngine` state into the candle callback path so no candle is processed after `Stopping` is entered.

## Capabilities

### New Capabilities

- `bot-stop-cancellation`: Cancellation of in-flight candle processing and signal execution when the bot enters the Stopping state.

### Modified Capabilities

- `bot-start-lifecycle`: The existing "Graceful shutdown closes real connections" requirement needs a stricter interpretation — shutdown must cancel in-flight processing, not just close connections.

## Impact

- **Files**: `src/trading/bot-engine.ts`, `src/trading/bybit-websocket.ts`, `src/trading/scheduler.ts`, `src/trading/live-scheduler.ts`
- **Tests**: Existing `bot-lifecycle.test.ts` must pass. New tests needed for cancellation behavior.
- **Risk**: Low — cancellation only triggers during state transitions, normal operation unchanged.

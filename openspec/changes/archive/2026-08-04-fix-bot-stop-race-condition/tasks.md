## 1. WebSocket — Stop message processing on disconnect

- [x] 1.1 Add `if (this.isStopped) return;` guard at the top of `handleKlineMessage()` in `src/trading/bybit-websocket.ts`
- [x] 1.2 Add unit test: messages received after `disconnect()` do not invoke the candle callback
- [x] 1.3 Add unit test: `disconnect()` prevents reconnection even if close event fires

## 2. Scheduler — Accept and honour AbortSignal

- [x] 2.1 Add optional `signal?: AbortSignal` parameter to `Scheduler.tick()` in `src/trading/scheduler.ts`
- [x] 2.2 Check `signal.aborted` at start of `tick()` — return immediately if true
- [x] 2.3 Check `signal.aborted` between pair iterations — break loop if aborted mid-batch
- [x] 2.4 Add `signal?: AbortSignal` parameter to `LiveScheduler.liveTick()` and pass through to `super.tick()`
- [x] 2.5 Add unit test: `tick()` with pre-aborted signal processes zero candles
- [x] 2.6 Add unit test: `tick()` with signal aborted mid-batch stops after current pair

## 3. BotEngine — Wire AbortController to shutdown path

- [x] 3.1 Add `_abortController: AbortController | null` field to `BotEngine`
- [x] 3.2 Create new `AbortController` in `initialize()` and store reference
- [x] 3.3 Call `_abortController.abort()` at the start of `stop()` and `emergencyStop()`, before the state transition
- [x] 3.4 Pass `_abortController.signal` to `scheduler.liveTick()` in `handleCandle()`
- [x] 3.5 Null `_abortController` in `shutdown()` after aborting
- [x] 3.6 Add integration test: stop during in-flight candle processing aborts the tick
- [x] 3.7 Add integration test: multiple concurrent ticks are all aborted on stop

## 4. Verification

- [x] 4.1 Run existing `bot-lifecycle.test.ts` — all tests pass
- [x] 4.2 Run existing `live-scheduler.test.ts` and `scheduler.test.ts` — all tests pass
- [x] 4.3 Run full test suite — no regressions

## Context

The bot lifecycle is managed by `BotEngine` which owns a `StateMachine`, a `BybitWebSocketService` (bar feed), a `LiveScheduler`, and a `LiveStrategyExecutor`. When a candle arrives, `handleCandle` fire-and-forgets `scheduler.liveTick()`. The `stop()` method transitions to `Stopping`, then calls `shutdown()` which disconnects the bar feed and nulls references. Two race conditions allow in-flight candle processing to continue after stop is requested.

## Goals / Non-Goals

**Goals:**
- Cancel all in-flight candle processing within one tick of the stop transition
- Ensure no new candle callbacks fire after `disconnect()` returns
- Preserve existing behavior for normal (non-stop) operation
- Keep changes minimal and focused on the shutdown path

**Non-Goals:**
- Changing the WebSocket reconnection logic (already correct)
- Modifying the scheduler's two-phase pipeline (signal collection → order submission)
- Adding graceful position closure (Phase 2 concern, separate change)
- Changing the frontend stop button behavior

## Decisions

### Decision 1: Use `AbortController` for cancellation

**Choice:** Add an `AbortController` to `BotEngine`. On stop, call `abort()` and pass the signal to the scheduler.

**Why over alternatives:**
- `AbortController` is the standard Web API for cancelling async operations — no external dependency
- Alternative: Boolean flag checked manually in `tick()` — works but requires every loop iteration to check, easy to forget
- Alternative: Cancel the promise via a custom cancel token — reinvents AbortController

**How it works:**
```
BotEngine
  ├── _abortController: AbortController | null
  ├── stop()
  │     ├── _abortController.abort()  ← immediate
  │     ├── state → Stopping
  │     └── shutdown()
  └── handleCandle()
        └── scheduler.liveTick(candles, _abortController.signal)
```

### Decision 2: Guard `Scheduler.tick()` with signal check

**Choice:** `tick()` accepts `AbortSignal?`. If aborted before or during processing, it returns immediately or stops iterating.

**Implementation:**
- Check `signal?.aborted` at the start of `tick()` — skip if already aborted
- Check `signal?.aborted` between pair iterations — stop if aborted mid-batch
- Do NOT abort mid-candle (let current candle finish to avoid partial state)

### Decision 3: Stop candle callback on disconnect

**Choice:** Add `isStopped` check in `handleKlineMessage` before invoking `onCandle`.

**Current code:**
```ts
private handleKlineMessage(message: BybitKlineMessage): void {
  if (!message.data.confirm) return;
  // ... parse and invoke onCandle
}
```

**After fix:**
```ts
private handleKlineMessage(message: BybitKlineMessage): void {
  if (this.isStopped) return;           // ← new guard
  if (!message.data.confirm) return;
  // ... parse and invoke onCandle
}
```

`isStopped` is already set at the top of `disconnect()`, so any message arriving after `disconnect()` is called but before the socket closes will be silently dropped.

### Decision 4: Do not await in-flight ticks in shutdown

**Choice:** `shutdown()` does NOT wait for in-flight `liveTick()` promises to resolve. It disconnects the bar feed and nulls references immediately.

**Why:** Waiting would require tracking all in-flight promises, adding complexity. The abort signal terminates them quickly. The scheduler and executor are nulled, so any lingering promise that somehow completes will find null references and no-op.

## Risks / Trade-offs

- **[Risk]** A candle mid-processing when abort fires could leave a partially submitted order. **→ Mitigation:** The abort check happens between pair iterations, not mid-candle. Current candle completes fully. Order submission uses a mutex, so partial state is unlikely.

- **[Risk]** If `shutdown()` nulls the scheduler while `liveTick()` is awaiting the mutex, the mutex callback could throw. **→ Mitigation:** The mutex callback catches errors. The scheduler is already designed to isolate errors per pair.

- **[Trade-off]** Abrupt cancellation vs graceful drain. We choose abrupt because the user explicitly requested stop — delayed execution after stop is unexpected and potentially dangerous (orders executing after user thinks bot is stopped).

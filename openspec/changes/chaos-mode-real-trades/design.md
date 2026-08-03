## Context

The chaos mode implementation generates signals in `LiveStrategyExecutor.processCandleChaos()` but the scheduler's `submitOrders` callback is a no-op. The `LiveStrategyExecutor.executeSignal()` method already handles the full DEX flow (balance check → quote → swap → position update) and just needs to be called from the right place.

The current flow:

```
Candle close
    │
    ▼
handleCandle() → scheduler.liveTick()
    │
    ▼
processCandle callback → strategyExecutor.processCandle()
    │
    ▼
processCandleChaos() → generates TradeSignal[]
    │
    ▼
scheduler collects signals → calls submitOrders()
    │
    ▼
submitOrders() → NO-OP ← signals discarded
```

The target flow:

```
Candle close
    │
    ▼
handleCandle() → scheduler.liveTick()
    │
    ▼
processCandle callback → strategyExecutor.processCandle()
    │
    ▼
processCandleChaos() → generates TradeSignal[]
    │
    ▼
scheduler collects signals → calls submitOrders()
    │
    ▼
submitOrders() → strategyExecutor.executeSignal() for each signal
    │
    ▼
DEX execution (quote → swap → position update)
```

## Goals / Non-Goals

**Goals:**
- Wire `submitOrders` to call `executeSignal()` for each scheduler signal
- Map scheduler `TradeSignal` → executor `TradeSignal` (type conversion)
- Handle execution results (log success/failure, track stats)
- Preserve existing behavior for non-chaos mode

**Non-Goals:**
- Changing signal generation logic
- Adding new risk controls (emergency stop and daily loss limit already exist)
- Modifying the scheduler or executor class interfaces
- Adding batch execution (signals execute sequentially, one at a time)

## Decisions

### 1. Wire in `submitOrders` callback, not in `processCandle`

**Decision**: Add the execution logic to the `submitOrders` callback in `BotEngine.initialize()`.

**Why**: The scheduler already has a mutex-serialized `submitOrders` phase. Putting execution here means:
- All signals from a tick are submitted atomically (within the mutex)
- No race conditions between multiple pairs
- The existing error isolation in `Scheduler.tick()` catches per-pair errors

**Alternatives considered**:
- Execute in `processCandle` callback: Would execute during signal collection phase, bypassing the mutex. Could cause race conditions with multiple pairs.
- Execute in `LiveStrategyExecutor.processCandleChaos()`: Would mix signal generation with execution, violating single responsibility.

### 2. Map scheduler TradeSignal → executor TradeSignal inline

**Decision**: In the `submitOrders` callback, map each `Scheduler.TradeSignal` to `LiveStrategyExecutor.TradeSignal` before calling `executeSignal()`.

**Why**: The two types have different shapes (scheduler uses `pair: PairId` + `price`, executor uses `symbol: string` + `expectedPrice`). The mapping is simple and doesn't justify a separate adapter.

**Mapping**:
```
scheduler.signal.pair.symbol   → executor.signal.symbol
scheduler.signal.action        → executor.signal.action
scheduler.signal.quantity      → executor.signal.quantity
scheduler.signal.price         → executor.signal.expectedPrice
scheduler.signal.timestamp     → executor.signal.timestamp
```

### 3. Execute signals sequentially, not in parallel

**Decision**: Process signals one at a time with `for...of` + `await`, not `Promise.all()`.

**Why**: DEX operations are stateful (balance changes after each swap). Parallel execution could cause:
- Double-spend (two buys using the same balance)
- Position corruption (sell before buy settles)
- Nonce conflicts on Solana

The mutex in `Scheduler.tick()` already serializes the batch, so sequential execution within the batch is natural.

### 4. Log execution results, don't throw on failure

**Decision**: Catch execution errors per-signal, log them, and continue to the next signal. Don't let one failed order kill the entire batch.

**Why**: Chaos mode is for stress testing. A failed order (e.g., insufficient balance) is expected behavior, not a fatal error. The bot should continue generating and attempting signals.

### 5. Signals execute only on confirmed real-time candle closes

**Constraint**: Chaos mode execution is gated to confirmed real-time candles only. The flow is:

```
Bybit WebSocket → bar feed callback → handleCandle()
  → scheduler.liveTick() → processCandle()
    → chaos signal generation → submitOrders()
      → DEX execution
```

This chain only fires on confirmed candle closes from the live data feed. Signals are never generated or executed during backtesting (which uses historical bar data), on forming/in-progress candles, or when the bot is disconnected from the live feed.

**Why**: Chaos mode is for stress-testing the live trading pipeline. Executing on backtest candles would be incorrect — backtest candles are historical (no live DEX state, no real balance to trade with). Executing on forming candles would be incorrect — the candle is incomplete and the close price is not final.

**Implementation**: The existing `handleCandle()` guard (`this.state !== BotState.Running`) already ensures execution only happens when the bot is live-connected. The bar feed callback only fires on confirmed closes from the Bybit WebSocket. No additional gating code is needed — the constraint is inherent in the architecture. The spec makes this explicit for documentation and verification purposes.

## Risks / Trade-offs

- **[Risk] Rapid signal churn causes excessive DEX calls** → Mitigation: 10% sizing limits exposure. Emergency stop available. DEX rate limits may throttle naturally.
- **[Risk] Solana transaction failures under rapid submission** → Mitigation: Sequential execution with per-signal error handling. Failed transactions are logged, not retried.
- **[Risk] Position state drift if DEX execution is slow** → Mitigation: Position state is updated in `executeSignal()` after confirmed swap. In-flight signals may see stale state, but this is acceptable for chaos testing.
- **[Trade-off] Sequential vs parallel execution** → Sequential is safer for stateful DEX operations. Parallel would be faster but risks double-spend and nonce conflicts. Sequential is correct for v1.

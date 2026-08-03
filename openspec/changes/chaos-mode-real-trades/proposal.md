## Why

Chaos mode generates random trading signals but never executes them on the DEX. The `submitOrders` callback in the scheduler is a no-op, so all chaos signals are discarded. The `LiveStrategyExecutor.executeSignal()` method exists and handles the full DEX flow (balance check → quote → swap → position update), but is never called from the chaos mode path. Chaos mode is useless for stress testing if it doesn't actually trade.

## What Changes

- **Wire `submitOrders` callback** in `BotEngine.initialize()` to call `LiveStrategyExecutor.executeSignal()` for each scheduler signal
- **Map scheduler signals to executor signals** — type conversion between `Scheduler.TradeSignal` and `LiveStrategyExecutor.TradeSignal`
- **Gate execution to confirmed candles** — chaos signals only fire on real-time candle closes from the live bar feed, never during backtesting or on forming candles
- **Handle execution results** — log success/failure, track positions, handle insufficient balance gracefully
- **Preserve existing behavior** — normal (non-chaos) strategy execution continues to work unchanged

## Capabilities

### New Capabilities
_(none — this is a fix to an existing capability)_

### Modified Capabilities
- `chaos-test-mode`: Chaos mode signals must be executed on the DEX, not silently discarded. The `submitOrders` pipeline must call `executeSignal()` for each generated signal.

## Impact

- **Backend**: `BotEngine.initialize()` — the `submitOrders` callback changes from no-op to real execution
- **No frontend changes** — execution is backend-only
- **No new types or APIs** — reuses existing `executeSignal()` method
- **Risk**: Real money flows. Chaos mode uses 10% equity sizing, but rapid random signals could cause significant drawdown. The dashboard warning and emergency stop are the safety nets.

## Non-goals

- Not changing the chaos signal generation logic (already works)
- Not adding new risk controls beyond what exists (emergency stop, daily loss limit)
- Not modifying the scheduler or strategy executor interfaces

## Why

When a Pine Script strategy emits `strategy.entry("Short", strategy.short)`, the live trading path silently ignores it. The `LiveStrategyExecutor.processCandle()` has placeholder logic that only checks for long entries/exits. On a spot DEX like Jupiter Swap, short selling is impossible — but the system should still interpret a short signal as "close the current long position" rather than silently dropping it. This matches TradingView's behavior where a short entry reverses an existing long.

## What Changes

- `LiveStrategyExecutor.processCandle()` will detect short signals and emit a `'close'` action if a long position is open
- Short signals when flat (no position) will be logged as a warning and ignored
- The strategy engine's `StrategyMarker` with `direction: 'short'` will be mapped to `TradeSignal.action: 'close'` instead of being dropped

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `strategy-execution`: The live trading path must interpret short signals as position-closing actions when a long position exists, and warn when flat

## Impact

- **Code**: `src/trading/live-strategy-executor.ts` — `processCandle()` method
- **Behavior**: Strategies that emit short signals will now close existing long positions instead of silently ignoring the signal
- **No API changes**: Internal behavior only
- **No dependencies**: Uses existing types and DEX adapter

## Non-goals

- Short selling on spot DEXes (not possible)
- Margin/futures support
- Modifying the backtest engine (already handles shorts correctly)

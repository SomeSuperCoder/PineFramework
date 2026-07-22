## Why

The strategy engine supports partial exit sizing but lacks the critical infrastructure for realistic multi-level exit strategies. Users cannot set multiple take-profit levels from a single entry, exits are not grouped (both TP1 and TP2 can fill independently), and PineScript's richer `strategy.exit()` parameters (`profit`, `loss`, `qty_percent`, `from_entry`, trailing stops) are missing — limiting parity with TradingView.

## What Changes

- **OCA (One-Cancels-All) grouping for exit orders**: When multiple exit orders are placed for the same entry, they share an OCA group. When one fills, all others in the group are automatically cancelled. Prevents double-exiting a position.
- **Richer `strategy.exit()` builtin parameters**: Add `profit`, `loss`, `qty_percent`, `from_entry`, `trail_price`, `trail_offset` support matching TV's API.
- **`from_entry` targeting**: Allow exits to target specific entry IDs when pyramiding, closing only that entry's portion.
- **Trailing stop mechanics**: `trail_price`/`trail_offset` parameters update the stop price as the market moves favorably.
- **Multi-level exit tests**: Integration tests for the full flow: entry → TP1 (50%) @ target 1 → TP2 (50%) @ target 2 → flat.

**No breaking changes.** All existing code continues to work. New parameters are additive.

## Capabilities

### New Capabilities
- `oca-exit-groups`: One-Cancels-All order grouping for strategy exit orders. Ensures that when one exit in a group fills, sibling exits are cancelled.
- `strategy-exit-rich-params`: Extended `strategy.exit()` parameter support beyond basic stop/limit — `profit`, `loss`, `qty_percent`, `from_entry`, trailing stop parameters.
- `trailing-stop`: Trailing stop loss mechanics that adjust the stop price as price moves favorably.

### Modified Capabilities
- `strategy-execution`: Update the `strategy.exit()` scenario to reflect new parameters and OCA behavior. Add scenarios for multi-level exits and `from_entry`.
- `strategy-backtest-engine`: Ensure backtest engine correctly processes OCA cancellations and trailing stop adjustments during bar processing.

## Impact

- **`src/strategy/strategy-engine.ts`**: OCA group tracking in `processPendingOrders`, trailing stop state, `from_entry` tracking in position composition. Changes to `exit()`, `fillOrder()`, `closeOrReducePosition()`, `updateBar()`.
- **`src/language/runtime/builtins/strategy-builtins.ts`**: Expanded `strategy.exit` builtin to parse new named arguments.
- **`tests/strategy/strategy-engine.test.ts`**: New test suites for OCA behavior, multi-TP, trailing stops, `from_entry`.
- **`tests/strategy/backtest-engine.test.ts`**: Multi-level exit backtest scenarios.

## 1. OCA Grouping in Engine

- [ ] 1.1 Add `_nextOcaGroupId` counter to `StrategyEngine` for generating unique OCA group IDs
- [ ] 1.2 Modify `exit()` to assign `ocaGroup` on non-market exit orders using the current entry name
- [ ] 1.3 Modify `processPendingOrders()` to cancel sibling OCA orders after a fill
- [ ] 1.4 Clear OCA groups when position goes flat (in `closeOrReducePosition` and `openOrAddPosition` when position resets)
- [ ] 1.5 Add unit tests: OCA groups created correctly, fill cancels siblings, close flattens cancels remaining

## 2. Position Lot Tracking (FIFO)

- [ ] 2.1 Add `PositionLot` interface and `lots: PositionLot[]` field to `Position`
- [ ] 2.2 Modify `openOrAddPosition()` to push new lots on entry and compute aggregate `quantity`/`avgPrice` from lots
- [ ] 2.3 Modify `closeOrReducePosition()` to pop lots FIFO when reducing position and update aggregate fields
- [ ] 2.4 Ensure `entryName` on each lot enables `from_entry` targeting
- [ ] 2.5 Add serialization/deserialization of lots in `save()`/`load()` snapshot methods
- [ ] 2.6 Add unit tests: FIFO reduction, lot tracking across multiple pyramiding adds

## 3. Richer Exit Parameters in Builtins

- [ ] 3.1 Add `profit` and `loss` named parameter parsing to `strategy.exit()` builtin, resolving ticks to absolute prices using `syminfo.mintick` (default 0.01)
- [ ] 3.2 Add `qty_percent` named parameter parsing to `strategy.exit()` builtin, resolving percentage to absolute quantity from `strategy.position_size`
- [ ] 3.3 Add `from_entry` named parameter parsing to `strategy.exit()` builtin
- [ ] 3.4 Add `trail_price` and `trail_offset` named parameter parsing to `strategy.exit()` builtin
- [ ] 3.5 Ensure named args work alongside positional args (matching TV's flexible calling convention)
- [ ] 3.6 Add unit tests for each new parameter: profit ticks, loss ticks, qty_percent, from_entry, trail_price, trail_offset

## 4. From Entry Targeting in Engine

- [ ] 4.1 Add `fromEntry?: string` parameter to `exit()` method signature
- [ ] 4.2 Modify `exit()` to filter position lots by `fromEntry` when specified, computing quantity from matching lots only
- [ ] 4.3 If `from_entry` specified but no matching lots found, return undefined (no order)
- [ ] 4.4 Wire `fromEntry` from builtin parameter through to engine call
- [ ] 4.5 Add unit tests: from_entry exits correct quantity, from_entry with no match returns undefined, from_entry with pyramiding

## 5. Trailing Stop in Engine

- [ ] 5.1 Add `TrailingStopState` interface and `trailingStops: Map<string, TrailingStopState>` to `StrategyEngine`
- [ ] 5.2 Add `trailPrice` and `trailOffset` fields to `Order` interface, set in `exit()` when trail params provided
- [ ] 5.3 Implement `updateTrailingStops(high, low)` method that updates stop prices from bar price action
- [ ] 5.4 Wire `updateTrailingStops` into `updateBar()` flow before `processPendingOrders()`
- [ ] 5.5 Handle trailing stop activation: only activate after price moves favorably by trail_offset from entry
- [ ] 5.6 Ensure trailing stop price never moves against the position (one-way ratchet for long)
- [ ] 5.7 Add serialization of trailing stops in `save()`/`load()` for state snapshot compatibility
- [ ] 5.8 Add unit tests: trailing stop updates on new highs, activates correctly, triggers on retracement, one-way ratchet

## 6. Multi-Level Exit Integration Tests

- [ ] 6.1 Write integration test: entry → two limit exits at different levels → verify one fills, other is OCA-cancelled
- [ ] 6.2 Write integration test: entry → bracket (profit TP + loss SL) → verify OCA behavior when one triggers
- [ ] 6.3 Write integration test: pyramiding with from_entry on the second entry's exit
- [ ] 6.4 Write integration test: trailing stop activation and trigger across multiple bars
- [ ] 6.5 Write integration test: qty_percent with multiple exit calls across different bars

## 7. Backtest Engine Updates

- [ ] 7.1 Verify BacktestEngine correctly processes OCA cancellations across bar boundaries
- [ ] 7.2 Add backtest-level test: multi-TP strategy runs in backtest, correct trade count and PnL
- [ ] 7.3 Add backtest-level test: trailing stop strategy in backtest produces expected exit price

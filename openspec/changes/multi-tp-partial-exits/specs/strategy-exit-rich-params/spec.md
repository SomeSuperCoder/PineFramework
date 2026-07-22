## ADDED Requirements

### Requirement: Profit/Loss Ticks Parameters
The `strategy.exit()` builtin SHALL accept `profit` and `loss` parameters specified in ticks from the entry price, matching TradingView PineScript behavior.

#### Scenario: Profit parameter sets limit at entry + profit ticks
- **WHEN** strategy.exit("TP", profit=100) is called on a long entry at $100 with syminfo.mintick=0.01
- **THEN** the engine SHALL place a limit exit order at $101.00 (entry + profit * mintick)

#### Scenario: Loss parameter sets stop at entry - loss ticks
- **WHEN** strategy.exit("SL", loss=50) is called on a long entry at $100 with syminfo.mintick=0.01
- **THEN** the engine SHALL place a stop exit order at $99.50 (entry - loss * mintick)

#### Scenario: Profit and Loss together create bracket
- **WHEN** strategy.exit("Bracket", profit=100, loss=50) is called on a long entry
- **THEN** the engine SHALL place both a limit exit (take-profit) and a stop exit (stop-loss) in the same OCA group

### Requirement: Qty Percent Parameter
The `strategy.exit()` builtin SHALL accept `qty_percent` to specify exit size as a percentage of the current position.

#### Scenario: Qty percent exits partial position
- **WHEN** strategy.exit("TP", qty_percent=50, limit=price) is called on a position of 100 units
- **THEN** the engine SHALL place an exit order for 50 units

#### Scenario: Qty percent over 100 is capped
- **WHEN** strategy.exit("Exit", qty_percent=150) is called on a position of 100 units
- **THEN** the engine SHALL place an exit order for 100 units (capped to position size)

### Requirement: From Entry Parameter
The `strategy.exit()` builtin SHALL accept `from_entry` to target a specific entry ID when pyramiding.

#### Scenario: From entry exits only that entry's portion
- **WHEN** strategy.entry("Buy1", strategy.long, qty=30) and strategy.entry("Buy2", strategy.long, qty=70) are both filled, and strategy.exit("TP", from_entry="Buy1", limit=price) is called
- **THEN** the engine SHALL place an exit order for only 30 units (Buy1's portion)

#### Scenario: From entry with no matching entry produces no order
- **WHEN** strategy.exit("TP", from_entry="NonExistent", limit=price) is called
- **THEN** the engine SHALL NOT place any exit order

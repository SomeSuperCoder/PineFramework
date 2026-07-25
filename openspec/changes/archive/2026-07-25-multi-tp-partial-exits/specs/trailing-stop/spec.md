## ADDED Requirements

### Requirement: Trailing Stop via Trail Price
The `strategy.exit()` builtin SHALL accept `trail_price` to set a trailing stop at a fixed offset from the current market price.

#### Scenario: Trail price moves stop up as price rises (long)
- **WHEN** strategy.exit("Trail", trail_price=5) is called on a long entry, and price rises from $100 to $110
- **THEN** the engine SHALL update the stop price to $105 ($110 - $5) on each bar

#### Scenario: Trail price does not move stop down (long)
- **WHEN** a trailing stop at trail_price=5 is active on a long entry, and price drops from $110 to $105
- **THEN** the engine SHALL NOT lower the stop price below its previous value

#### Scenario: Stop triggers when price hits trailing stop level
- **WHEN** a trailing stop is active and price reaches the current stop price
- **THEN** the engine SHALL fill the stop exit order

### Requirement: Trailing Stop via Trail Offset
The `strategy.exit()` builtin SHALL accept `trail_offset` (in ticks) to set a trailing stop offset from the highest price since entry.

#### Scenario: Trail offset trails from highest high
- **WHEN** strategy.exit("Trail", trail_offset=20) is called on a long entry at $100 with mintick=0.01, and price reaches a high of $110
- **THEN** the engine SHALL set the stop price at $109.80 ($110 - 20 * $0.01)

#### Scenario: Trail price and trail offset work together
- **WHEN** strategy.exit("Trail", trail_price=2.0, trail_offset=10) is called
- **THEN** the engine SHALL use trail_price as the activation trigger distance from entry, and trail_offset as the subsequent trailing distance

### Requirement: Trailing Stop Activation
A trailing stop SHALL only activate after the price has moved in the favorable direction by at least the trail_price or trail_offset amount from the entry price.

#### Scenario: Trail not active until favorable move
- **WHEN** a trailing stop with trail_offset=50 is placed on a long entry at $100
- **THEN** the stop SHALL NOT activate until price exceeds $100.50 (entry + trail_offset * mintick)

## MODIFIED Requirements

### Requirement: Strategy Mode Functions
The engine SHALL implement strategy mode with strategy.entry(), strategy.exit(), strategy.close(), strategy.cancel(), strategy.risk.*, strategy.position_size, strategy.openprofit, strategies for pyramiding, and brokerage emulation.

#### Scenario: strategy.entry()
- **WHEN** strategy.entry() is called
- **THEN** the engine SHALL create a new trade entry with direction and size

#### Scenario: strategy.exit() with rich parameters
- **WHEN** strategy.exit() is called with any combination of limit, stop, profit, loss, trail_price, trail_offset, qty, qty_percent, or from_entry
- **THEN** the engine SHALL create exit orders matching the specified parameters

#### Scenario: strategy.close()
- **WHEN** strategy.close() is called
- **THEN** the engine SHALL close the current position

#### Scenario: strategy.cancel()
- **WHEN** strategy.cancel() is called with an entry ID
- **THEN** the engine SHALL cancel the pending order

#### Scenario: strategy.risk Functions
- **WHEN** strategy.risk.allow_entry_in() or strategy.risk.max_intraday_filled_orders() is called
- **THEN** the engine SHALL respect the risk constraints

#### Scenario: strategy.position_size
- **WHEN** strategy.position_size is read
- **THEN** the engine SHALL return the current position size

#### Scenario: strategy.openprofit
- **WHEN** strategy.openprofit is read
- **THEN** the engine SHALL return the unrealized profit

#### Scenario: Pyramiding
- **WHEN** pyramiding is configured
- **THEN** the engine SHALL allow multiple concurrent entries

#### Scenario: Broker Emulation
- **WHEN** backtesting strategy orders
- **THEN** the engine SHALL emulate broker fill mechanics including OCA cancellation

#### Scenario: Partial Exit Sizing
- **WHEN** strategy.exit() is called with qty or qty_percent parameter
- **THEN** the engine SHALL exit only the specified quantity rather than full position

#### Scenario: Stop Loss Exit
- **WHEN** strategy.exit() is called with `stop=entryPrice * 0.95`
- **THEN** the engine SHALL compute the dynamic stop price from an expression

#### Scenario: Multi-Level Exits with OCA
- **WHEN** multiple strategy.exit() calls exist for the same entry
- **THEN** the engine SHALL group them in an OCA group such that filling one cancels the others

#### Scenario: From Entry Targeting
- **WHEN** strategy.exit() includes `from_entry` parameter and pyramiding is active
- **THEN** the engine SHALL only exit the portion of the position attributed to that specific entry

#### Scenario: Default Strategy ID Auto-Generation
- **WHEN** strategy() declaration lacks an explicit ID
- **THEN** the engine SHALL auto-generate a default ID (e.g., "default")

#### Scenario: Default Strategy Exit Size Inversion
- **WHEN** strategy.exit() exits without specifying size on a long position
- **THEN** the engine SHALL default to the current negative position size (full short)

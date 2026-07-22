## ADDED Requirements

### Requirement: Strategy engine rejects invalid order parameters
The strategy engine SHALL reject orders with invalid quantities, prices, or other parameters without corrupting internal state.

#### Scenario: Zero quantity order
- **WHEN** `strategy.entry()` is called with `qty=0`
- **THEN** the engine SHALL not crash; the order SHALL either be rejected or have no effect

#### Scenario: Negative quantity order
- **WHEN** `strategy.entry()` is called with a negative quantity
- **THEN** the engine SHALL not crash; the order SHALL not corrupt position tracking

#### Scenario: Negative price limit
- **WHEN** `strategy.entry()` is called with a negative limit price
- **THEN** the engine SHALL not crash; SHALL handle gracefully

#### Scenario: NaN price or quantity
- **WHEN** `strategy.entry()` receives `na` as price or quantity
- **THEN** the engine SHALL not crash; SHALL return a graceful failure

### Requirement: Strategy engine handles simultaneous entry and exit
The strategy engine SHALL correctly process orders that would enter and exit on the same bar.

#### Scenario: Entry and exit on same bar
- **WHEN** a strategy has an open position and a new entry signal plus exit signal triggers on the same bar
- **THEN** the engine SHALL process both without double-counting or state corruption

#### Scenario: Overlapping entry signals
- **WHEN** multiple entry signals trigger on the same bar for the same direction
- **THEN** pyramiding rules SHALL be respected; entries beyond the limit SHALL be ignored, not crash

### Requirement: Strategy engine handles extreme commission values
The commission calculator SHALL handle extreme or invalid commission parameters gracefully.

#### Scenario: Zero commission
- **WHEN** commission is set to 0
- **THEN** trades SHALL execute with no commission deducted

#### Scenario: NaN commission
- **WHEN** commission is set to NaN
- **THEN** the engine SHALL not crash; commission calculation SHALL return NA or 0

#### Scenario: Commission exceeding trade value
- **WHEN** commission amount exceeds the total trade value
- **THEN** the trade SHALL execute with commission capped to trade value or the engine SHALL handle gracefully without corruption

### Requirement: Strategy engine handles order type edge cases
The strategy engine SHALL correctly process limit, stop, and stop-limit orders at boundary conditions.

#### Scenario: Stop-limit order triggered and limit hit same bar
- **WHEN** a stop-limit buy order has stop=100 and limit=101, and the bar has low=99 (triggered) and high=102 (limit hit)
- **THEN** the order SHALL fill at the limit price on that bar

#### Scenario: Stop-limit order triggered but limit not hit
- **WHEN** a stop-limit buy order has stop=100 and limit=101, and the bar has low=99 (triggered) but high=100.5 (limit not hit)
- **THEN** a limit order SHALL persist at 101 and fill on a subsequent bar that reaches 101

#### Scenario: OCO order with both sides triggered same bar
- **WHEN** an OCO pair of stop-loss and take-profit both could trigger on the same bar
- **THEN** only one side SHALL execute; the other SHALL be cancelled

### Requirement: Strategy engine handles partial fills at price boundaries
The engine SHALL handle partial fills when bar range partially overlaps the order price.

#### Scenario: Limit order with price at bar extreme
- **WHEN** a limit buy order is at price 100 and the bar has low=100 exactly
- **THEN** the order SHALL fill (boundary condition)

#### Scenario: Stop order with price at bar extreme
- **WHEN** a stop sell order is at price 100 and the bar has low=100 exactly
- **THEN** the order SHALL be triggered (boundary condition: stop is breached when price <= stop for sells)

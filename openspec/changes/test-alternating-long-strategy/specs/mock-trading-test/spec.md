## Purpose

Provides a framework for testing Pine Script strategies with simulated order execution, allowing validation of strategy logic without blockchain transactions.

## ADDED Requirements

### Requirement: Mock order execution
The system SHALL simulate order execution without interacting with blockchain networks.

#### Scenario: Order placed without blockchain transaction
- **WHEN** a Pine Script strategy calls strategy.entry() or strategy.close()
- **THEN** the system records the order in a mock execution log
- **AND** no blockchain transaction is initiated

### Requirement: Position tracking
The system SHALL track current position state including size, entry price, and unrealized P&L.

#### Scenario: Position opened
- **WHEN** strategy.entry("Long", strategy.long) is executed
- **THEN** the system records a long position with correct size and entry price
- **AND** position state is updated to reflect open position

#### Scenario: Position closed
- **WHEN** strategy.close("Long") is executed while in a position
- **THEN** the system calculates realized P&L
- **AND** position state is cleared

### Requirement: Capital percentage sizing
The system SHALL support position sizing based on percentage of equity.

#### Scenario: 10% position sizing
- **WHEN** strategy is configured with default_qty_type=strategy.percent_of_equity and default_qty_value=10
- **THEN** each position SHALL use exactly 10% of current equity
- **AND** position size is recalculated for each new entry

### Requirement: Alternating position behavior
The system SHALL validate that alternating long strategy opens and closes positions on consecutive candles.

#### Scenario: Alternating open/close pattern
- **WHEN** alternating-long-strategy runs for multiple candles
- **THEN** positions alternate between open and close states
- **AND** each open occurs with 10% of current equity
- **AND** each close results in realized P&L calculation

### Requirement: Test reporting
The system SHALL generate test reports showing order execution history and strategy performance.

#### Scenario: Test report generated
- **WHEN** test execution completes
- **THEN** system produces a summary showing total orders, win rate, and final equity
- **AND** report includes timestamp for each order execution

# mock-trading-test Specification

## Purpose

Provides a framework for testing Pine Script strategies with simulated order execution, allowing validation of strategy logic without blockchain transactions.

## Requirements

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

### Requirement: Live-mode strategy execution harness

The mock trading harness SHALL validate the live trading path end-to-end: a compiled Pine strategy source evaluated on candles produces strategy markers, the markers translate into trade signals, and those signals execute against the mock DEX without blockchain transactions.

#### Scenario: Live path produces mock fills from real strategy signals

- **WHEN** the live strategy executor processes a candle with a configured Pine strategy source and a mock DEX adapter
- **THEN** the system SHALL record the strategy's `entry`/`exit` markers as orders in the mock execution log
- **AND** the system SHALL update the tracked position state to match the strategy engine's position

#### Scenario: Live path ignores signals during warm-up

- **WHEN** the executor processes historical warm-up bars through the compiled strategy
- **THEN** the system SHALL NOT record any mock orders for signals generated on those bars
- **AND** the strategy engine state SHALL be fully populated for subsequent live candles

#### Scenario: Determinism across harness and batch execution

- **WHEN** the same strategy source and bars are run through the mock live harness and through batch execution
- **THEN** the emitted strategy markers SHALL be identical, and the mock order log SHALL contain exactly the orders implied by those markers

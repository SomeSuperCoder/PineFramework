## ADDED Requirements

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

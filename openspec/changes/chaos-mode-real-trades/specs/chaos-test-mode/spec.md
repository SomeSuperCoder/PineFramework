## ADDED Requirements

### Requirement: Chaos mode signal execution

When chaos mode is active, the system SHALL execute chaos-generated signals on the DEX, but ONLY on confirmed real-time candle closes. Signals SHALL NOT be generated or executed during backtesting, on forming/in-progress candles, or when the bot is not connected to a live data feed. The `submitOrders` callback SHALL only fire when the scheduler receives a confirmed candle from the real-time bar feed. Each `long` signal SHALL result in a buy order, each `exit` signal SHALL result in a sell order closing the current position, and each `short` signal SHALL close any existing long position (spot DEX constraint).

#### Scenario: Long signal executes buy order

- **WHEN** chaos mode generates a `long` signal and the bot has sufficient USDC balance
- **THEN** the system SHALL submit a buy order to the DEX for 10% of current equity
- **AND** the order result (success/failure, transaction signature) SHALL be logged

#### Scenario: Exit signal executes sell order

- **WHEN** chaos mode generates an `exit` signal and the bot holds a long position
- **THEN** the system SHALL submit a sell order to the DEX to close the full position
- **AND** the order result SHALL be logged

#### Scenario: Short signal closes long position

- **WHEN** chaos mode generates a `short` signal and the bot holds a long position
- **THEN** the system SHALL submit a sell order to close the position (spot DEX constraint)
- **AND** if no position exists, the signal SHALL be logged and discarded

#### Scenario: Insufficient balance

- **WHEN** chaos mode generates a `long` signal but USDC balance is insufficient for the 10% position size
- **THEN** the system SHALL log the failure with the balance shortfall
- **AND** the bot SHALL continue running (no crash, no state corruption)

### Requirement: Chaos mode execution result tracking

The system SHALL track and expose chaos mode execution results including successful orders, failed orders, and total execution time.

#### Scenario: Execution stats available

- **WHEN** chaos mode has been running for multiple candle closes
- **THEN** the system SHALL track: total signals generated, orders executed, orders failed, total execution time

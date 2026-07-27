## Purpose
Implement persistent storage for trade history and debug information to enable post-mortem analysis and AI-assisted debugging.

## ADDED Requirements

### Requirement: Trade History Persistence
The system SHALL persistently record every trade execution with entries, exits, size, price, fees, realized PnL, execution time, DEX, and transaction signature.

#### Scenario: Trade entry recorded
- **WHEN** a position is opened
- **THEN** the system SHALL persist the entry record with symbol, side, size, price, timestamp, fees, DEX

#### Scenario: Trade exit recorded
- **WHEN** a position is closed
- **THEN** the system SHALL persist the exit record with close price, realized PnL, fees, and transaction signature

#### Scenario: Trade history queryable
- **WHEN** the user views trade history
- **THEN** the system SHALL return all persisted trade records ordered by time

### Requirement: Debug History
The system SHALL preserve enough historical information to enable AI-assisted debugging after failures.

#### Scenario: Log persistence
- **WHEN** the bot is running
- **THEN** all significant events SHALL be persisted with timestamps and structured metadata

#### Scenario: Market data snapshots
- **WHEN** debugging data is requested
- **THEN** the system SHALL provide recent market data snapshots for the relevant time period

#### Scenario: Order lifecycle trace
- **WHEN** a failure occurs
- **THEN** the debug history SHALL include the full order lifecycle (submitted, confirmed, failed)

#### Scenario: Wallet balance evolution
- **WHEN** debugging data is requested
- **THEN** the system SHALL provide the wallet balance evolution over time

### Requirement: Significant Event Logging
Every significant event SHALL be recorded with timestamp and structured metadata. Events include: bot started, bot stopped, strategy loaded, candle processed, signal generated, order submitted, order confirmed, swap failed, exception, and warning.

#### Scenario: Event categories
- **WHEN** any significant event occurs
- **THEN** it SHALL be logged with type, timestamp, and structured metadata

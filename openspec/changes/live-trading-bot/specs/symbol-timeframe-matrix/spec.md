## Purpose
Implement a deterministic, race-condition-free scheduler for executing strategies across multiple (Symbol × Timeframe) pairs simultaneously.

## ADDED Requirements

### Requirement: Symbol × Timeframe Matrix
The system SHALL allow the user to configure a matrix of (Symbol × Timeframe) pairs for simultaneous strategy execution.

#### Scenario: Configure multiple pairs
- **WHEN** the user configures the bot
- **THEN** they SHALL specify one or more symbol and timeframe combinations

#### Scenario: Concurrent execution
- **WHEN** multiple pairs are configured
- **THEN** the engine SHALL execute the strategy independently for each pair

#### Scenario: Example configuration
- **WHEN** the user configures BTC 1m, BTC 5m, ETH 1m, SOL 15m
- **THEN** the engine SHALL process all four pairs independently

### Requirement: Deterministic Scheduler
The scheduler SHALL guarantee deterministic execution ordering and prevent race conditions between concurrent pairs.

#### Scenario: Ordered execution
- **WHEN** multiple candles close at the same time
- **THEN** the scheduler SHALL process them in a deterministic order

#### Scenario: No race conditions
- **WHEN** two pairs trigger simultaneous orders
- **THEN** the scheduler SHALL serialize execution to prevent concurrent wallet access

#### Scenario: Configurable priority
- **WHEN** the user specifies a priority order for pairs
- **THEN** the scheduler SHALL respect that order

### Requirement: Shared Wallet Safety
Multiple strategy executions across different markets share the same wallet. The engine SHALL prevent overspending, double-spending, simultaneous balance usage, race conditions, and conflicting order submissions.

#### Scenario: Balance check before order
- **WHEN** an order is about to be submitted
- **THEN** the engine SHALL verify sufficient balance exists for the trade

#### Scenario: Serialized order submission
- **WHEN** multiple orders are queued
- **THEN** the engine SHALL submit them serially, not in parallel

#### Scenario: Portfolio consistency
- **WHEN** orders are executed
- **THEN** the internal portfolio accounting SHALL remain consistent at all times

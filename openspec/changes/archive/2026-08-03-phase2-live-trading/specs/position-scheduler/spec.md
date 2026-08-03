## Purpose

Manages Symbol × Timeframe pair execution with deterministic ordering and race-condition-free wallet operations.

## ADDED Requirements

### Requirement: Deterministic Pair Processing

The system SHALL process trading pairs in a deterministic, configurable order.

#### Scenario: Ordered pair execution

- **WHEN** multiple pairs are configured (e.g., BTCUSDT:60, SOLUSDT:15, ETHUSDT:30)
- **THEN** the system SHALL process them in the exact order they appear in the configuration

#### Scenario: Consistent iteration

- **WHEN** the same configuration is loaded multiple times
- **THEN** the system SHALL process pairs in the same order each time

### Requirement: Mutex-Serialized Wallet Operations

The system SHALL serialize all wallet-affecting operations using a mutex to prevent race conditions.

#### Scenario: Concurrent signal handling

- **WHEN** multiple pairs generate trade signals simultaneously
- **THEN** the system SHALL submit orders sequentially behind a mutex (one at a time)

#### Scenario: Mutex acquisition

- **WHEN** an order submission is in progress
- **THEN** subsequent submissions SHALL wait until the mutex is released

### Requirement: Candle-to-Signal Pipeline

The system SHALL process candles through a two-phase pipeline: signal generation, then order submission.

#### Scenario: Phase 1 — Signal collection

- **WHEN** a batch of closed candles arrives
- **THEN** the system SHALL process each candle through its pair's strategy and collect all signals

#### Scenario: Phase 2 — Order submission

- **WHEN** all signals are collected
- **THEN** the system SHALL submit all orders behind the mutex in a single batch

#### Scenario: Error isolation

- **WHEN** processing one pair's candle throws an error
- **THEN** the system SHALL log the error and continue processing other pairs

### Requirement: Pause and Resume

The system SHALL support pausing and resuming the scheduler without losing state.

#### Scenario: Pause execution

- **WHEN** the scheduler is paused
- **THEN** incoming candles SHALL be ignored (no processing)

#### Scenario: Resume execution

- **WHEN** the scheduler is resumed
- **THEN** new candles SHALL be processed normally

### Requirement: Scheduler Statistics

The system SHALL track execution statistics for monitoring and debugging.

#### Scenario: Tick count

- **WHEN** the scheduler processes a batch of candles
- **THEN** the system SHALL increment the tick counter

#### Scenario: Signal and order counts

- **WHEN** signals are generated and orders submitted
- **THEN** the system SHALL track total signals generated and total orders submitted

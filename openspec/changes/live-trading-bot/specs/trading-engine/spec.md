## Purpose
Implement the headless trading engine with deterministic state machine, bot lifecycle management, and PineScript-compatible realtime execution for live trading.

## ADDED Requirements

### Requirement: Bot State Machine
The trading engine SHALL implement a deterministic state machine with states: Idle, Starting, Running, Stopping, Stopped, and Error.

#### Scenario: Initial state is Idle
- **WHEN** the application starts and no bot has been started
- **THEN** the trading engine SHALL be in the Idle state

#### Scenario: Start transitions to Running
- **WHEN** the user initiates a bot start and configuration is valid
- **THEN** the engine SHALL transition Idle → Starting → Running

#### Scenario: Stop transitions to Stopped
- **WHEN** the user initiates a bot stop
- **THEN** the engine SHALL transition Running → Stopping → Stopped

#### Scenario: Error state on failure
- **WHEN** an unrecoverable error occurs during Running state
- **THEN** the engine SHALL transition to Error state and log the cause

#### Scenario: Recovery from Error
- **WHEN** the engine is in Error state and the user acknowledges
- **THEN** the engine SHALL transition to Stopped state

#### Scenario: State transitions are logged
- **WHEN** any state transition occurs
- **THEN** the engine SHALL log the transition with timestamp, from state, to state, and reason

### Requirement: Headless Architecture
The trading engine SHALL be completely independent from the frontend UI. Closing the UI SHALL NOT stop or interrupt active trading.

#### Scenario: Engine runs without frontend
- **WHEN** the frontend disconnects while the bot is running
- **THEN** the engine SHALL continue executing strategies and managing positions

#### Scenario: Frontend reconnects to active bot
- **WHEN** the frontend reconnects after disconnect
- **THEN** it SHALL receive the full current state of the running bot

### Requirement: Single Active Bot
Only one bot instance SHALL be actively trading at a time, but the internal architecture SHALL support future expansion to multiple concurrent instances.

#### Scenario: Start rejects if already running
- **WHEN** a start is requested while the bot is in Running state
- **THEN** the engine SHALL reject the request with an appropriate error

#### Scenario: Data model uses identifiers
- **WHEN** storing bot state, positions, or orders
- **THEN** data models SHALL include a bot instance identifier rather than assuming a singleton

### Requirement: PineScript Realtime Execution
The engine SHALL execute Pine Script strategies bar-by-bar on confirmed candle close, faithfully reproducing TradingView strategy behavior.

#### Scenario: Execution on confirmed close
- **WHEN** a realtime candle closes
- **THEN** the engine SHALL execute the strategy with the completed bar data

#### Scenario: strategy.entry() on close
- **WHEN** strategy.entry() is triggered on bar close
- **THEN** the engine SHALL submit the order to the configured DEX

#### Scenario: strategy.exit() on close
- **WHEN** strategy.exit() is triggered on bar close
- **THEN** the engine SHALL submit the exit order to the configured DEX

#### Scenario: Intrabar execution is prohibited
- **WHEN** a realtime candle is still forming
- **THEN** the engine SHALL NOT execute strategy.entry(), strategy.exit(), or strategy.close() intrabar unless Pine Script semantics explicitly allow it

### Requirement: Reusable PineScript Engine Instance
The trading engine SHALL instantiate the existing PineScript engine for each new bar execution, reusing the same script compilation across bars.

#### Scenario: Compile once per bot start
- **WHEN** the bot starts
- **THEN** the engine SHALL compile the selected strategy script once

#### Scenario: Execute on each bar close
- **WHEN** a candle closes
- **THEN** the engine SHALL feed the completed bar to the compiled script and collect strategy signals

## Purpose
Implement a real-time live monitoring dashboard that displays bot state, performance metrics, positions, and streaming logs — designed for monitoring, not configuration.

## ADDED Requirements

### Requirement: Live Status Display
The dashboard SHALL display current bot state, active strategy, DEX, wallet info, running duration, current balance, realized PnL, unrealized PnL, current positions, and exposure.

#### Scenario: Status indicators
- **WHEN** the bot is running
- **THEN** the dashboard SHALL show the current state, strategy name, DEX, and wallet public key

#### Scenario: Running duration
- **WHEN** the bot has been running
- **THEN** the dashboard SHALL display elapsed time since the bot started

#### Scenario: Balance and PnL
- **WHEN** the bot has open positions or trade history
- **THEN** the dashboard SHALL show current balance, realized PnL, and unrealized PnL

#### Scenario: Positions
- **WHEN** the bot has open positions
- **THEN** the dashboard SHALL show each position with symbol, side, size, entry price, and current PnL

#### Scenario: Exposure
- **WHEN** the bot has open positions
- **THEN** the dashboard SHALL show total exposure as a percentage of the portfolio

### Requirement: Performance Metrics
The dashboard SHALL display computed metrics: trade count, win rate, average win, average loss, profit factor, drawdown, fees paid, swap count, and execution latency.

#### Scenario: Metrics aggregation
- **WHEN** trades have been executed
- **THEN** the dashboard SHALL aggregate and display all computed metrics

#### Scenario: Metrics update in realtime
- **WHEN** a new trade is completed
- **THEN** the metrics SHALL update immediately

### Requirement: Live Log Stream
The dashboard SHALL stream logs in realtime so the user can verify that candles are processed, strategies execute, orders are submitted, and confirmations arrive.

#### Scenario: Realtime log stream
- **WHEN** the bot is running
- **THEN** the dashboard SHALL show a scrollable, auto-updating log stream

#### Scenario: Log categories
- **WHEN** events occur
- **THEN** logs SHALL include: candle processed, signal generated, order submitted, order confirmed, swap failed, exception, warning

#### Scenario: Never static
- **WHEN** the bot is actively trading
- **THEN** the dashboard SHALL continuously update rather than appearing as a static snapshot

### Requirement: Continuous Updates
The dashboard SHALL update continuously via WebSocket connection to the backend.

#### Scenario: WebSocket connection
- **WHEN** the dashboard is open
- **THEN** it SHALL establish a WebSocket connection for real-time updates

#### Scenario: Reconnect on disconnect
- **WHEN** the WebSocket disconnects
- **THEN** the dashboard SHALL automatically attempt to reconnect

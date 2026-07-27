## Purpose
Implement configurable risk management controls including daily stop loss, emergency stop from frontend and Telegram, and safe shutdown procedures.

## ADDED Requirements

### Requirement: Daily Stop Loss
The system SHALL allow the user to configure a maximum daily loss threshold. When cumulative realized losses exceed this threshold, no new positions may be opened.

#### Scenario: Daily loss threshold configured
- **WHEN** the user configures a daily loss limit
- **THEN** the engine SHALL track cumulative realized losses for the current trading day

#### Scenario: Threshold breached
- **WHEN** cumulative realized losses exceed the configured daily limit
- **THEN** the engine SHALL prevent any new position entries

#### Scenario: Existing positions during stop loss
- **WHEN** the daily stop loss is triggered
- **THEN** existing positions SHALL still be managed (exits allowed)

#### Scenario: Optional immediate close
- **WHEN** the daily stop loss is triggered and the user configured immediate close
- **THEN** all open positions SHALL be closed immediately

#### Scenario: Daily limit reset
- **WHEN** a new trading day begins according to the configured timezone
- **THEN** the daily loss counter SHALL reset to zero

#### Scenario: Notification on trigger
- **WHEN** the daily stop loss is triggered
- **THEN** the system SHALL notify the user

### Requirement: Emergency Stop
The bot SHALL support emergency stop from the frontend and from Telegram, which cancels pending actions, safely closes all open positions, stops strategy execution, and generates an audit log.

#### Scenario: Emergency stop from frontend
- **WHEN** the user clicks Emergency Stop in the UI
- **THEN** the engine SHALL cancel pending orders, close all positions, stop execution, and log the event

#### Scenario: Emergency stop from Telegram
- **WHEN** the user sends an emergency stop command via Telegram
- **THEN** the engine SHALL perform the same emergency stop procedure

#### Scenario: Audit log generation
- **WHEN** an emergency stop occurs
- **THEN** the system SHALL generate a detailed audit log entry with timestamp and trigger source

### Requirement: Safe Shutdown
Stopping the bot SHALL never leave positions unmanaged. The shutdown procedure SHALL: stop accepting new entries, finish current processing, close open positions, persist all state, then terminate.

#### Scenario: Graceful stop
- **WHEN** the user requests a normal stop
- **THEN** the engine SHALL: 1) reject new entries, 2) finish current bar processing, 3) close open positions, 4) persist state, 5) terminate

#### Scenario: No orphaned positions
- **WHEN** a stop is completed
- **THEN** there SHALL be no open positions left unmanaged

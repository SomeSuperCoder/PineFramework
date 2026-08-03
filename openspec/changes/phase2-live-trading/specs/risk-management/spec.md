## Purpose

Tracks daily P&L and enforces risk limits with emergency stop triggers.

## ADDED Requirements

### Requirement: Daily Loss Tracking

The system SHALL track cumulative daily P&L and enforce stop-loss limits.

#### Scenario: Loss accumulation

- **WHEN** a trade closes with a loss
- **THEN** the system SHALL add the loss to the daily running total

#### Scenario: Daily reset

- **WHEN** a new day begins (configured timezone)
- **THEN** the system SHALL reset the daily P&L counter to zero

### Requirement: Rolling 24-Hour Loss Limit

The system SHALL enforce a rolling 24-hour loss limit separate from daily resets.

#### Scenario: Rolling limit tracking

- **WHEN** a trade closes
- **THEN** the system SHALL check if the loss occurred within the last 24 hours and include it in the rolling total

#### Scenario: Rolling limit breach

- **WHEN** the rolling 24-hour loss exceeds the configured maximum
- **THEN** the system SHALL trigger an emergency stop

### Requirement: Emergency Stop

The system SHALL support immediate emergency stop to halt all trading and close positions.

#### Scenario: Manual emergency stop

- **WHEN** the user triggers emergency stop via API
- **THEN** the system SHALL immediately halt all pending orders and close open positions

#### Scenario: Automatic emergency stop on loss limit

- **WHEN** the daily or rolling loss limit is breached
- **THEN** the system SHALL automatically trigger emergency stop

#### Scenario: Emergency stop notification

- **WHEN** emergency stop is triggered (manual or automatic)
- **THEN** the system SHALL send a Telegram notification with the reason

### Requirement: Risk Configuration

The system SHALL allow configuring risk parameters per bot instance.

#### Scenario: Max daily loss configuration

- **WHEN** the user configures `risk.maxDailyLoss: 100`
- **THEN** the system SHALL enforce a maximum daily loss of $100 USD

#### Scenario: Daily loss timezone

- **WHEN** the user configures `risk.dailyLossTimezone: "UTC"`
- **THEN** the system SHALL reset daily P&L at midnight UTC

### Requirement: Position Exposure Tracking

The system SHALL track current position exposure for risk monitoring.

#### Scenario: Open position tracking

- **WHEN** a position is opened
- **THEN** the system SHALL record the position size and entry price

#### Scenario: Position close tracking

- **WHEN** a position is closed
- **THEN** the system SHALL remove it from active positions and update realized P&L

## Purpose
Implement and verify Telegram Notification Integration functionality for the telegram-notification module.

## MODIFIED Requirements

### Requirement: Telegram Notification Integration
The system SHALL integrate with Telegram Bot API to send trading notifications (signals, alerts, errors, and live trading events) to configured recipients.

#### Scenario: Signal Notification
- **WHEN** a trading signal is generated
- **THEN** the system SHALL send a notification via Telegram

#### Scenario: Error Notification
- **WHEN** an execution error occurs
- **THEN** the system SHALL notify the configured Telegram recipients

#### Scenario: Alert Configuration
- **WHEN** configuring alerts
- **THEN** the user SHALL specify which events trigger Telegram notifications

#### Scenario: Bot start notification [ADDED]
- **WHEN** the live trading bot starts
- **THEN** the system SHALL send a Telegram notification with bot configuration details

#### Scenario: Bot stop notification [ADDED]
- **WHEN** the live trading bot stops
- **THEN** the system SHALL send a Telegram notification with run summary

#### Scenario: Position opened notification [ADDED]
- **WHEN** a position is opened by the live bot
- **THEN** the system SHALL send a Telegram notification with symbol, side, size, and execution price

#### Scenario: Position closed notification [ADDED]
- **WHEN** a position is closed by the live bot
- **THEN** the system SHALL send a Telegram notification with symbol, side, size, execution price, realized PnL, and transaction link

#### Scenario: Emergency stop notification [ADDED]
- **WHEN** an emergency stop is triggered
- **THEN** the system SHALL send a Telegram notification with the trigger source

#### Scenario: Daily stop loss notification [ADDED]
- **WHEN** the daily stop loss limit is reached
- **THEN** the system SHALL send a Telegram notification with loss details

### Requirement: Customizable Notification Content
The system SHALL allow customizable notification message templates.

#### Scenario: Message Template
- **WHEN** a notification is sent
- **THEN** it SHALL use the configured message template with dynamic fields

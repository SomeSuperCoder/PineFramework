## ADDED Requirements

### Requirement: Rolling 24h loss tracking
The system SHALL track realized PnL from all trades executed within the last 24 hours using a rolling window.

#### Scenario: Trade recorded within 24h window
- **WHEN** a trade closes with a realized loss
- **THEN** the loss SHALL be added to the rolling 24h buffer
- **AND** the total rolling loss SHALL be recalculated

#### Scenario: Trade older than 24h expires
- **WHEN** a new trade is recorded
- **THEN** all trades older than 24 hours SHALL be removed from the buffer
- **AND** the rolling loss total SHALL be recalculated excluding expired trades

#### Scenario: Profit trades do not reduce rolling loss
- **WHEN** a trade closes with a profit
- **THEN** the profit SHALL NOT reduce the rolling loss total
- **AND** the trade SHALL be recorded in the buffer for PnL tracking

### Requirement: Mandatory emergency stop on loss breach
The system SHALL automatically trigger an emergency stop when rolling 24h loss exceeds the configured maximum daily loss.

#### Scenario: Rolling loss exceeds limit
- **WHEN** the rolling 24h loss reaches or exceeds `maxDailyLoss`
- **THEN** the system SHALL trigger emergency stop immediately
- **AND** all open positions SHALL be closed
- **AND** all pending orders SHALL be cancelled
- **AND** no new positions SHALL be opened until bot is restarted

#### Scenario: Emergency stop prevents new entries
- **WHEN** rolling 24h loss has breached the limit
- **AND** the bot is still running
- **THEN** `canEnterPosition()` SHALL return `false`

### Requirement: Telegram alert on loss breach
The system SHALL send a Telegram notification when the rolling 24h loss triggers an emergency stop.

#### Scenario: Loss breach notification
- **WHEN** rolling 24h loss exceeds `maxDailyLoss`
- **THEN** a Telegram message SHALL be sent with:
  - Alert type: "🚨 ROLLING 24H LOSS LIMIT BREACHED"
  - Current loss amount
  - Configured limit
  - Number of trades in the 24h window
  - Timestamp

### Requirement: No toggle for safety feature
The rolling loss guard SHALL always be active when `maxDailyLoss > 0`. There SHALL be no UI toggle to disable it.

#### Scenario: Guard active by default
- **WHEN** bot is configured with `maxDailyLoss > 0`
- **THEN** the rolling loss guard SHALL be active
- **AND** no "Close all on loss" checkbox SHALL appear in the config UI

#### Scenario: Unlimited mode disables guard
- **WHEN** bot is configured with `maxDailyLoss = 0`
- **THEN** the rolling loss guard SHALL be inactive
- **AND** no emergency stop SHALL be triggered by loss

## MODIFIED Requirements

### Requirement: RiskConfig simplified
The `RiskConfig` interface SHALL NOT include `closeOnDailyLoss`. The `timezone` field SHALL be removed from risk config (rolling 24h is timezone-independent).

#### Scenario: Config without closeOnDailyLoss
- **WHEN** bot is configured via POST `/api/bot/configure`
- **THEN** the `risk` object SHALL accept only `maxDailyLoss`
- **AND** `closeOnDailyLoss` field SHALL be ignored if present (backward compatible)
- **AND** `dailyLossTimezone` field SHALL be ignored if present (backward compatible)

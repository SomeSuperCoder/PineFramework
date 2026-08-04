## Purpose

Provides a chaos testing mode that bypasses user strategy logic and generates random trading signals on every real-time candle close, enabling continuous stress-testing of the bot's order execution pipeline, position management, and error handling under unpredictable conditions.

## ADDED Requirements

### Requirement: Chaos mode configuration

The system SHALL support a `chaosMode` flag in `BotConfig` that, when enabled, overrides normal strategy execution with random signal generation.

#### Scenario: Chaos mode enabled in config

- **WHEN** `BotConfig.chaosMode.enabled` is `true`
- **THEN** the system SHALL ignore the configured Pine Script strategy and generate random trading signals instead

#### Scenario: Chaos mode disabled by default

- **WHEN** `BotConfig` is loaded and `chaosMode` is not specified
- **THEN** `chaosMode.enabled` SHALL default to `false` and normal strategy execution SHALL proceed

### Requirement: Random signal generation

The system SHALL generate a random trading signal on the close of every real-time candle when chaos mode is active. The signal SHALL be one of `long`, `short`, or `exit`, selected with equal probability (1/3 each).

#### Scenario: Signal generated on candle close

- **WHEN** a real-time candle closes and chaos mode is active
- **THEN** the system SHALL generate exactly one random signal: `long`, `short`, or `exit`

#### Scenario: Signal has equal probability distribution

- **WHEN** chaos mode runs for 300 candle closes
- **THEN** each signal type (`long`, `short`, `exit`) SHALL appear approximately 100 times (within statistical variance)

### Requirement: Fixed 10% capital sizing in chaos mode

The system SHALL use exactly 10% of current equity for every position opened during chaos mode, regardless of the strategy's `default_qty_value` or other sizing configuration.

#### Scenario: Position sized at 10% of equity

- **WHEN** chaos mode generates a `long` or `short` signal and current equity is $10,000
- **THEN** the position size SHALL be $1,000 (10% of equity)

#### Scenario: Equity recalculated per signal

- **WHEN** chaos mode generates consecutive signals
- **THEN** each position size SHALL be calculated from the current equity at the time of the signal, not the initial capital

### Requirement: Chaos mode signal logging

The system SHALL log every chaos-generated signal with its type, timestamp, generated equity at time of signal, and the resulting position state.

#### Scenario: Signal logged

- **WHEN** a chaos signal is generated
- **THEN** the system SHALL record: signal type (`long`/`short`/`exit`), timestamp, current equity, and resulting position summary

### Requirement: Chaos mode activation via hidden UI gesture

The system SHALL provide a hidden activation mechanism on the review/backtest screen. The user SHALL be able to toggle chaos mode by repeatedly tapping a designated hidden area.

#### Scenario: Activation gesture recognized

- **WHEN** the user taps the hidden area 5 times within 3 seconds on the review screen
- **THEN** the system SHALL toggle chaos mode state and show a confirmation toast

#### Scenario: Chaos mode persists across sessions

- **WHEN** chaos mode is toggled on
- **THEN** the setting SHALL persist in `BotConfig` until explicitly toggled off

### Requirement: Dashboard chaos mode warning

When chaos mode is active and the trading dashboard opens, the system SHALL display a prominent full-screen warning banner before any dashboard content is visible.

#### Scenario: Warning banner displayed

- **WHEN** chaos mode is active and the user opens the trading dashboard
- **THEN** the system SHALL display a full-width warning banner with text "⚠️ CHAOS MODE ACTIVE — RANDOM SIGNALS" and a confirmation button to proceed

#### Scenario: Dashboard blocked until acknowledged

- **WHEN** the warning banner is displayed
- **THEN** the dashboard content SHALL NOT be visible until the user acknowledges the warning

### Requirement: Chaos mode status indicator

The system SHALL display a persistent indicator when chaos mode is active, visible in both the review screen and the trading dashboard.

#### Scenario: Status indicator visible

- **WHEN** chaos mode is enabled
- **THEN** a visible indicator (e.g., badge, icon, or text) SHALL appear in the UI showing chaos mode is active

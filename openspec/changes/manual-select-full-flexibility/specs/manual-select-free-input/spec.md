## Purpose

Provides unrestricted pair and timeframe selection in manual mode, allowing users to trade any Bybit-supported symbol with any valid timeframe.

## ADDED Requirements

### Requirement: Free-text pair input
The system SHALL replace the hardcoded pair dropdown with a text input field that accepts any valid Bybit symbol.

#### Scenario: User enters valid symbol
- **WHEN** user types "AVAXUSDT" in the pair input
- **THEN** the symbol is accepted and used for trading

#### Scenario: User enters symbol not in default list
- **WHEN** user enters a symbol not in the default list (e.g., "LINKUSDT")
- **THEN** the system accepts it with a warning that it's not in the default list

### Requirement: Free-text timeframe input
The system SHALL replace the hardcoded timeframe dropdown with a text input field that accepts any valid timeframe in minutes.

#### Scenario: User enters valid timeframe
- **WHEN** user types "120" in the timeframe input
- **THEN** the timeframe is accepted and used for trading (represents 2 hours)

#### Scenario: Common timeframe presets
- **WHEN** the timeframe input is displayed
- **THEN** quick-select chips for common timeframes (1m, 5m, 15m, 30m, 1h, 4h, 1d) are shown below the input

### Requirement: Input validation
The system SHALL validate that the entered pair and timeframe are non-empty and properly formatted.

#### Scenario: Empty input
- **WHEN** user clicks "Start" with empty pair or timeframe
- **THEN** an error message is shown: "Pair and timeframe are required"

#### Scenario: Invalid timeframe format
- **WHEN** user enters non-numeric text in timeframe input
- **THEN** the system shows "Timeframe must be a number (minutes)"

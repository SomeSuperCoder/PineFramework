## Purpose

Revert manual pair and timeframe selection in the trading bot dashboard from free-text inputs back to `<select>` dropdown elements with curated options, providing a simpler and less error-prone user experience.

## ADDED Requirements

### Requirement: Pair selection SHALL use dropdown
The manual pair selection SHALL use a `<select>` element with predefined trading pair options. Users SHALL NOT be able to enter arbitrary text.

#### Scenario: User selects pair from dropdown
- **WHEN** user is in manual selection mode
- **THEN** pair selection displays a dropdown with options: BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT, DOGEUSDT, ADAUSDT
- **AND** selected value is used as the trading pair

### Requirement: Timeframe selection SHALL use dropdown
The manual timeframe selection SHALL use a `<select>` element with predefined timeframe options. Users SHALL NOT be able to enter arbitrary text.

#### Scenario: User selects timeframe from dropdown
- **WHEN** user is in manual selection mode
- **THEN** timeframe selection displays a dropdown with options: 1m, 5m, 15m, 30m, 1h, 4h, 1d
- **AND** selected value (in minutes) is used as the timeframe

### Requirement: Dropdowns SHALL have sensible defaults
The pair dropdown SHALL default to empty ("Select pair...") and timeframe SHALL default to "60" (1 hour).

#### Scenario: Default values on load
- **WHEN** manual selection mode is activated
- **THEN** pair dropdown shows "Select pair..." (empty value)
- **AND** timeframe dropdown shows "1h" (value "60")

### Requirement: Validation SHALL prevent empty selections
The system SHALL require both pair and timeframe to be selected before proceeding. An error message SHALL appear if either is empty.

#### Scenario: Empty pair blocked
- **WHEN** user tries to proceed without selecting a pair
- **THEN** system shows error "Both pair and timeframe are required"

#### Scenario: Empty timeframe blocked
- **WHEN** user tries to proceed without selecting a timeframe
- **THEN** system shows error "Both pair and timeframe are required"

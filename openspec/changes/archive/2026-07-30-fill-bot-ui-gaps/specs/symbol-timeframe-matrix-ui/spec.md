## ADDED Requirements

### Requirement: Per-Pair Timeframe Input
The frontend SHALL allow the user to specify a unique timeframe for each trading pair when configuring the bot.

#### Scenario: Input format
- **WHEN** the user enters pairs in the format `SYMBOL TIMEFRAME` (one per line)
- **THEN** the frontend SHALL parse each line into a `{ symbol, timeframe }` pair

#### Scenario: Default timeframe
- **WHEN** the user enters a symbol without a timeframe
- **THEN** the frontend SHALL default to `60` (1 hour)

#### Scenario: Invalid timeframe warning
- **WHEN** the user enters a timeframe not in the valid set (`1`, `3`, `5`, `15`, `30`, `60`, `120`, `240`, `D`, `W`, `M`)
- **THEN** the frontend SHALL show an inline warning on the invalid line
- **AND** the frontend SHALL still allow configuration to proceed (backend will validate)

#### Scenario: API payload
- **WHEN** the user clicks Apply Configuration
- **THEN** the frontend SHALL send `pairs` as an array of `{ symbol: string, timeframe: string }` objects in the POST body

#### Scenario: Placeholder examples
- **WHEN** the pairs textarea is empty
- **THEN** it SHALL show placeholder text: `SOLUSDT 60\nBTCUSDT 240\nETHUSDT 60\nSOLUSDT 15`

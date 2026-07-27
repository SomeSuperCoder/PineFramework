## ADDED Requirements

### Requirement: Strategy Compatibility Warning
The frontend SHALL check the strategy source for patterns incompatible with live spot trading before the user starts the bot.

#### Scenario: Short-only pattern warning
- **WHEN** the strategy source contains `strategy.short`
- **THEN** the frontend SHALL show a yellow warning banner: "This strategy uses short positions. Spot trading only supports long positions."

#### Scenario: Limit order warning
- **WHEN** the strategy source contains `strategy.entry` with `limit=` parameter
- **THEN** the frontend SHALL show a yellow warning: "Limit orders are not supported by DEX swaps. Market orders will be used."

#### Scenario: Multiple warnings
- **WHEN** multiple incompatible patterns are detected
- **THEN** the frontend SHALL show all warnings in a list

#### Scenario: Warnings are non-blocking
- **WHEN** a warning is displayed
- **THEN** the user SHALL still be able to start the bot
- **AND** the backend will perform full validation on `configure()`

#### Scenario: No false positives
- **WHEN** the strategy source contains `strategy.short` only inside a string or comment
- **THEN** the frontend SHALL NOT show a warning for that occurrence

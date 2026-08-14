## Purpose

Lets Telegram users run a strategy backtest from the bot chat by picking settings through a guided conversation and receiving the result as a concise, prettily formatted image card.

## Requirements

### Requirement: Backtest command entry
The system SHALL provide a `/backtest` bot command that starts a guided backtest settings conversation for the user who invoked it.

#### Scenario: Start wizard
- **WHEN** a user sends `/backtest` in a chat with the bot
- **THEN** the bot replies with the first wizard step (strategy selection) using an inline keyboard, and records a wizard session for that chat

#### Scenario: Wizard re-entry
- **WHEN** a user sends `/backtest` while a wizard session is already active for that chat
- **THEN** the bot restarts the wizard from the first step, discarding the previous session's partial settings

### Requirement: Settings conversation
The system SHALL guide the user through selecting, in order: strategy, symbol, timeframe, days-back, commission method, initial capital. Each step SHALL present the current choice and allow going back or restarting.

#### Scenario: Step completion
- **WHEN** the user selects an option at a wizard step
- **THEN** the bot advances to the next step with an inline keyboard for that step, keeping the previously selected values

#### Scenario: Back navigation
- **WHEN** the user presses a back control at a wizard step
- **THEN** the bot returns to the previous step with the previous selection preserved

#### Scenario: Cancel
- **WHEN** the user presses a cancel control at any wizard step
- **THEN** the bot ends the wizard session and confirms cancellation with a localized message

#### Scenario: Stale keyboard tap
- **WHEN** the user taps a callback button from a superseded wizard step
- **THEN** the bot ignores the tap with a non-disruptive response and keeps the active session state

### Requirement: Strategy selection
The system SHALL present the user with strategies available in the strategy library and accept only strategies of kind strategy (not indicator) for backtesting.

#### Scenario: Library populated
- **WHEN** the user reaches the strategy step and the strategy library contains strategies
- **THEN** the bot lists them as inline keyboard options with navigation for more than one page

#### Scenario: Empty library
- **WHEN** the user reaches the strategy step and the strategy library contains no strategies
- **THEN** the bot shows a localized empty-state message and ends the wizard without offering a run

#### Scenario: Indicator excluded
- **WHEN** the strategy library contains an indicator-only script
- **THEN** that script is not offered as a backtest option

### Requirement: Symbol, timeframe, and days-back selection
The system SHALL offer a fixed set of tradeable symbols, timeframe choices, and days-back presets, and SHALL prevent any selection combination that would exceed the backtest engine's maximum bar count.

#### Scenario: Symbol selection
- **WHEN** the user reaches the symbol step
- **THEN** the bot offers the curated symbol list as inline keyboard options

#### Scenario: Timeframe selection
- **WHEN** the user reaches the timeframe step
- **THEN** the bot offers the supported timeframe list as inline keyboard options

#### Scenario: Days-back presets bounded by bar cap
- **WHEN** the user reaches the days-back step
- **THEN** the offered presets are capped so that the implied bar count for the selected timeframe stays within the engine's maximum bar count

#### Scenario: Invalid days-back selection blocked
- **WHEN** a days-back preset would produce more bars than the engine maximum for the selected timeframe
- **THEN** the bot does not offer it, or rejects the selection with a localized explanation

### Requirement: Commission method selection
The system SHALL offer the supported commission methods for the backtest and SHALL map the user's selection to the same explicit override the CLI/HTTP paths use.

#### Scenario: Method selection
- **WHEN** the user reaches the commission method step
- **THEN** the bot offers the supported commission methods as inline keyboard options

#### Scenario: Fee handling parity
- **WHEN** the user selects a commission method that requires live fee data
- **THEN** the run applies the same fee resolution behavior as the CLI/HTTP paths, including the existing explicit-fee bypass and failure semantics

### Requirement: Initial capital selection
The system SHALL offer preset initial-capital amounts for the backtest and SHALL forward the chosen value as the explicit initial capital for the run, so the engine uses it instead of its default.

#### Scenario: Capital presets offered
- **WHEN** the user reaches the initial capital step
- **THEN** the bot offers the preset amounts ($10, $100, $1,000, $10,000) as inline keyboard options

#### Scenario: Non-preset value rejected
- **WHEN** the user selects a capital value that is not one of the offered presets
- **THEN** the bot rejects the selection and keeps the wizard on the initial capital step

#### Scenario: Chosen capital forwarded
- **WHEN** the user confirms a capital preset and the run is assembled
- **THEN** the run's explicit config includes that initial capital, and the run summary shows the chosen amount

### Requirement: In-process backtest execution
The system SHALL execute the backtest in-process through a producer seam that reuses the existing backtest pipeline, without changing CLI/HTTP/export behavior, and SHALL keep the bot responsive during the run.

#### Scenario: Run initiated
- **WHEN** the user confirms the final wizard step (run)
- **THEN** the bot acknowledges immediately with a localized running message, then executes the backtest asynchronously without blocking other bot responses

#### Scenario: Single concurrent run per chat
- **WHEN** a backtest is already running for a chat and the user tries to start another
- **THEN** the bot rejects the second run with a localized message that a run is in progress

#### Scenario: Bar cap respected
- **WHEN** the run is assembled from the wizard settings
- **THEN** the bar count is validated against the engine maximum and the user receives a localized explanation if the combination is invalid

### Requirement: Result card image
The system SHALL render the backtest result as a concise 800×440 image card styled like the existing trading-stats card, and send it as a photo with a localized caption.

#### Scenario: Successful run sends card
- **WHEN** the backtest completes successfully
- **THEN** the bot sends the result as an image card showing at minimum: net PnL (absolute and percent), trade count, win rate, profit factor (when computable), max drawdown, Sharpe ratio, buy & hold return, and the effective settings used

#### Scenario: Zero-trade run
- **WHEN** the backtest completes with no trades
- **THEN** the bot sends the card showing zero/no-trade values for trade-dependent metrics without rendering invalid ratios

#### Scenario: Failed run message
- **WHEN** the backtest fails (engine error, fee resolution failure, or timeout)
- **THEN** the bot replies with a sanitized, localized error message and does not expose internal stack traces

### Requirement: Localized text
The system SHALL provide every user-facing string of the wizard and its replies in the supported bot languages (en, es, ru), resolved by the same i18n mechanism as existing bot messages.

#### Scenario: Non-English language
- **WHEN** the user's chat language is Spanish or Russian
- **THEN** the wizard steps, buttons, running message, result caption, and errors appear in that language

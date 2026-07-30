## ADDED Requirements

### Requirement: Backtest step in setup wizard
The setup wizard SHALL include a "Backtest" step between Config and Review where auto-select backtests run visibly.

#### Scenario: Wizard flow includes backtest step
- **WHEN** the user completes the Config step and clicks "Apply configuration"
- **THEN** the wizard SHALL transition to a "Backtest" step (not directly to Review)

#### Scenario: Backtest step shows progress
- **WHEN** the Backtest step is active
- **THEN** the system SHALL display a real-time progress grid showing each candidate pair's status (pending, active, done, failed)

#### Scenario: Backtest step shows phase transitions
- **WHEN** auto-select is executing
- **THEN** the system SHALL show phase transitions for each pair: fetching → backtesting → done/failed

### Requirement: Visual progress during backtest
The Backtest step SHALL display per-pair progress with clear status indicators.

#### Scenario: Status icons displayed
- **WHEN** the Backtest step renders the progress grid
- **THEN** each pair SHALL show a status icon: gray dash (pending), spinning indicator (active), green checkmark (done), red X (failed)

#### Scenario: Overall progress counter
- **WHEN** backtests are running
- **THEN** the system SHALL display "Evaluating Pairs (X/Y)" where X is completed count and Y is total candidates

### Requirement: Ranking display after backtest
The Backtest step SHALL display the final ranking once all backtests complete.

#### Scenario: Ranking shown on completion
- **WHEN** all backtests finish
- **THEN** the system SHALL display the ranked list with the best pair highlighted

#### Scenario: Best pair summary
- **WHEN** backtests complete
- **THEN** the system SHALL show "Best: [pair]" with key metrics (profit factor, Sharpe ratio)

### Requirement: Navigation from backtest step
The user SHALL be able to navigate away from the Backtest step.

#### Scenario: Back button cancels and returns to config
- **WHEN** the user clicks "Back" during or after backtests
- **THEN** the wizard SHALL return to the Config step and discard backtest results

#### Scenario: Proceed button enabled after completion
- **WHEN** all backtests complete
- **THEN** the "Next" button SHALL be enabled to proceed to Review

#### Scenario: Proceed button disabled during backtests
- **WHEN** backtests are still running
- **THEN** the "Next" button SHALL be disabled

### Requirement: Review step uses pre-computed results
The Review step SHALL display auto-select results from the Backtest step without re-running backtests.

#### Scenario: Review shows cached ranking
- **WHEN** the user reaches the Review step after completing backtests
- **THEN** the system SHALL display the pre-computed ranking and best pair selection

#### Scenario: Start bot uses selected pair
- **WHEN** the user clicks "Start Bot" on the Review step
- **THEN** the system SHALL start the bot with the pair selected during the Backtest step (no re-evaluation)

### Requirement: Error handling during backtest
The Backtest step SHALL handle failures gracefully.

#### Scenario: Partial failure display
- **WHEN** some backtests fail
- **THEN** the system SHALL show failed pairs with red X icons and continue evaluating remaining pairs

#### Scenario: Total failure error state
- **WHEN** all backtests fail
- **THEN** the system SHALL display an error message and allow the user to go back to Config

#### Scenario: Backend error during backtest
- **WHEN** the backend encounters an error during auto-select
- **THEN** the system SHALL display the error message in the Backtest step

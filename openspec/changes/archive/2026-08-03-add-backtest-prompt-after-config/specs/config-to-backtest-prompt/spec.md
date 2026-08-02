## Purpose

Provides a decision point after config submission, letting the user choose between running the auto-select backtest or manually selecting a trading pair and timeframe.

## ADDED Requirements

### Requirement: Config submission shows backtest choice prompt

After the user submits a valid configuration, the system SHALL display a prompt asking whether to run the auto-select backtest or manually select a pair/timeframe. The backtest SHALL NOT start automatically on config submission.

#### Scenario: Prompt displayed after config submission

- **WHEN** the user submits a valid configuration in the Config step
- **THEN** the system SHALL display a choice prompt with two options: "Run Auto-Select Backtest" and "Manually Select Pair & Timeframe"
- **AND** the backtest SHALL NOT start automatically

#### Scenario: User chooses auto-select backtest

- **WHEN** the user selects "Run Auto-Select Backtest" from the prompt
- **THEN** the system SHALL trigger the backtest API call with the configured timeframes
- **AND** the Backtest step SHALL display auto-select progress as it does today

#### Scenario: User chooses manual selection

- **WHEN** the user selects "Manually Select Pair & Timeframe" from the prompt
- **THEN** the system SHALL advance to the Backtest step in manual selection mode
- **AND** the Backtest step SHALL display a warning about bypassing auto-select

### Requirement: Manual selection mode displays warning

When the user enters manual selection mode, the system SHALL display a warning explaining the implications of bypassing auto-select.

#### Scenario: Warning displayed on manual selection

- **WHEN** the user enters the Backtest step in manual selection mode
- **THEN** the system SHALL display a warning message stating that auto-select was skipped and the user is fully responsible for their pair/timeframe choice
- **AND** the warning SHALL be visually distinct (e.g., amber/yellow styling)

### Requirement: Manual selection mode provides pair and timeframe pickers

In manual selection mode, the Backtest step SHALL provide UI controls for selecting a specific trading pair and timeframe.

#### Scenario: User selects pair and timeframe manually

- **WHEN** the user is in manual selection mode on the Backtest step
- **THEN** the system SHALL display a pair selector and timeframe selector
- **AND** the user SHALL be able to proceed to the Review step with their manual selection

#### Scenario: Manual selection proceeds to Review

- **WHEN** the user has selected a pair and timeframe in manual selection mode and clicks "Next"
- **THEN** the system SHALL advance to the Review step with the manually selected pair/timeframe
- **AND** the Review step SHALL display the manually selected pair

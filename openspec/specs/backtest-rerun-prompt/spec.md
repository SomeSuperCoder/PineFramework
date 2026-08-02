## Purpose

Allows users to re-run the auto-select backtest from the Review step when their saved config hasn't been validated since the last page reload.

## Requirements

### Requirement: Review step detects stale auto-select config

The system SHALL detect when a persisted bot config has `autoSelect: true` and no resolved pair selection from the current session.

#### Scenario: Stale config detected

- **WHEN** the user reaches the Review step with a persisted config where `autoSelect` is `true` and no backtest has been run in the current session
- **THEN** the Review step SHALL display a "Re-run Backtest" button alongside the Start button

### Requirement: Re-run backtest advances wizard

The "Re-run Backtest" button SHALL advance the wizard to the Backtest step and present the same choice prompt as the initial config submission: auto-select backtest or manual selection.

#### Scenario: User clicks re-run backtest

- **WHEN** the user clicks the "Re-run Backtest" button on the Review step
- **THEN** the wizard SHALL advance to the Backtest step
- **AND** the system SHALL display the choice prompt (auto-select vs manual selection)
- **AND** the backtest SHALL NOT start automatically

#### Scenario: User chooses auto-select from re-run

- **WHEN** the user selects "Run Auto-Select Backtest" from the re-run prompt
- **THEN** the backtest SHALL start automatically with the configured timeframes

#### Scenario: User chooses manual selection from re-run

- **WHEN** the user selects "Manually Select Pair & Timeframe" from the re-run prompt
- **THEN** the system SHALL enter manual selection mode with the warning and pickers

### Requirement: Backtest completion returns to Review

After the backtest completes, the wizard SHALL return to the Review step with the resolved config.

#### Scenario: Backtest completes successfully

- **WHEN** the auto-select backtest finishes and the config is persisted with `autoSelect: false` and resolved pairs
- **THEN** the wizard SHALL advance to the Review step
- **AND** the Start button SHALL be enabled for the user to start the bot

### Requirement: Config persistence after re-run

The backtest results SHALL be persisted to disk, ensuring subsequent page loads use the resolved config.

#### Scenario: Page reload after re-run backtest

- **WHEN** the user reloads the page after a successful backtest re-run
- **THEN** the persisted config SHALL have `autoSelect: false` and the resolved pairs
- **AND** the Review step SHALL NOT display the "Re-run Backtest" button

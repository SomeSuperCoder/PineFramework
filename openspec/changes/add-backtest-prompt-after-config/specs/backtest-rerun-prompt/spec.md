## MODIFIED Requirements

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

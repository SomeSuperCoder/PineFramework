## ADDED Requirements

### Requirement: Backtest Panel SHALL Select Strategy via Dropdown
The backtest panel SHALL let the user choose which strategy to backtest through a strategy dropdown populated from the strategies API (user scripts + built-ins). The selected strategy's Pine source SHALL be sent as the `script` field of the backtest request. The backtest flow SHALL NOT depend on the chart as the strategy source.

#### Scenario: User selects a strategy and runs backtest
- **WHEN** a user chooses a strategy from the panel's dropdown and clicks run
- **THEN** the backtest request SHALL include the chosen strategy's Pine source as `script`
- **AND** the panel SHALL run the backtest for that strategy regardless of chart state

#### Scenario: Backtest blocked without strategy selection
- **WHEN** a user attempts to run a backtest without a strategy selected
- **THEN** the panel SHALL block the submission
- **AND** SHALL surface a visible message telling the user to select a strategy

### Requirement: Backtest Panel SHALL Show Strategy List States
The backtest panel strategy dropdown SHALL communicate loading, empty, and selection states so the user understands the strategy list status.

#### Scenario: Strategy list loading
- **WHEN** the strategy list is loading
- **THEN** the dropdown SHALL indicate a loading state

#### Scenario: No strategies available
- **WHEN** the strategy list is empty
- **THEN** the dropdown SHALL indicate no strategies are available
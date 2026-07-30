## ADDED Requirements

### Requirement: Auto-select step uses shared ProgressBar
The auto-select backtest step SHALL use the shared `ProgressBar` component for progress display.

#### Scenario: ProgressBar shows during backtest
- **WHEN** auto-select backtests are running
- **THEN** the system SHALL display a `<ProgressBar>` with progress percentage and "Evaluating" phase text

#### Scenario: AutoSelectGrid shows per-pair status
- **WHEN** auto-select backtests are running
- **THEN** the system SHALL display `AutoSelectGrid` below the progress bar for per-pair status

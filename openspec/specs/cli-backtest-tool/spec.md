## Purpose
Implement and verify CLI Backtest Tool functionality for the cli-backtest-tool module.

## Requirements

### Requirement: CLI Backtest Tool
The system SHALL provide a CLI backtest tool for running strategies from the command line.

#### Scenario: CLI Backtest Execution
- **WHEN** the backtest CLI command is invoked
- **THEN** it SHALL execute the specified strategy over the specified data range

#### Scenario: CLI Options
- **WHEN** the backtest CLI is used
- **THEN** it SHALL accept parameters: symbol, timeframe, start date, end date, initial capital, and commission method; the commission method MUST be one of `jupiter_manual` (Jupiter Swap) or `jupiter_ultra` (Jupiter Ultra), and MUST be provided explicitly — the CLI MUST NOT run with a silent default commission

#### Scenario: CLI Output
- **WHEN** the backtest completes
- **THEN** the CLI SHALL output performance metrics and trade log

### Requirement: CLI user-facing config summary
The CLI user output SHALL include a summary of the effective configuration that actually ran (resolved date range, commission method, and other effective settings), so a CLI user can see what was executed without reading an export.

#### Scenario: CLI prints effective config
- **WHEN** a CLI backtest completes
- **THEN** the output includes the effective configuration (resolved range, commission method, effective settings) alongside the metrics

### Requirement: CLI warning display
The CLI user output SHALL display any warnings collected during the run (suppressed orders, fee decisions, baselines).

#### Scenario: CLI prints warnings
- **WHEN** a CLI backtest completes with warnings
- **THEN** the output lists the warnings next to the metrics

### Requirement: CLI date-range alignment
The CLI SHALL resolve its backtest date range with the same UTC-midnight day-aligned semantics as the API, and SHALL use the same resolved range for fetching data and reporting results.

#### Scenario: CLI fetch and display agree
- **WHEN** the CLI resolves a lookback range
- **THEN** the data fetched and the range reported both reflect the same UTC-midnight-aligned start and end, so bar counts are consistent with the API for the same request

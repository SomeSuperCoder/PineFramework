## ADDED Requirements

### Requirement: Strategy Backtest Engine
The system SHALL provide a backtest engine within the backend that processes historical data, executes strategy scripts, and computes performance metrics.

#### Scenario: Historical Backtest
- **WHEN** a strategy backtest is requested with historical data
- **THEN** the backend SHALL run the strategy across the data range

#### Scenario: Metrics Computation
- **WHEN** backtesting completes
- **THEN** the backend SHALL compute and return all standard metrics (net profit, Sharpe ratio, drawdown, etc.)

#### Scenario: Trade Logging
- **WHEN** a backtest executes trades
- **THEN** each trade SHALL be logged with entry/exit timestamps, prices, and P&L

### Requirement: CLI Backtest Tool
The system SHALL provide a CLI-based backtesting tool for running strategies from the command line.

#### Scenario: CLI Backtest Execution
- **WHEN** the CLI backtest command is run
- **THEN** it SHALL execute the strategy and output performance results

#### Scenario: CLI Backtest Options
- **WHEN** the CLI backtest command is used
- **THEN** it SHALL accept parameters for symbol, timeframe, date range, initial capital, and commission

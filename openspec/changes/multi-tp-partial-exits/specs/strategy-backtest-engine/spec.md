## ADDED Requirements

### Requirement: OCA Processing in Backtest
The backtest engine SHALL correctly process OCA order groups during bar simulation, ensuring that when one order in a group fills, remaining orders are cancelled before processing further fills.

#### Scenario: OCA fill prevents other fills in same bar
- **WHEN** a bar's high price triggers both a TP limit at $105 and a separate TP limit at $110 in the same OCA group
- **THEN** only the first-matched order SHALL fill, and the second SHALL be cancelled

### Requirement: Trailing Stop Processing in Backtest
The backtest engine SHALL track and update trailing stop prices during bar processing as price moves favorably.

#### Scenario: Trailing stop updates on new highs
- **WHEN** a trailing stop exit is active and a new bar sets a higher high
- **THEN** the engine SHALL update the stop price to (new_high - trail_offset) before processing orders

#### Scenario: Trailing stop triggers on retracement
- **WHEN** a trailing stop is at $105 and price retraces to or below $105 within the same bar
- **THEN** the engine SHALL fill the stop exit order

## MODIFIED Requirements

### Requirement: Strategy Backtest Engine
The system SHALL provide a backtest engine within the backend that processes historical data, executes strategy scripts, computes performance metrics, and respects OCA order semantics.

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

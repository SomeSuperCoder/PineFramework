## Purpose
Implement automatic market selection that uses historical backtesting to evaluate and rank all supported Symbol × Timeframe combinations, then chooses the best-performing configuration.

## ADDED Requirements

### Requirement: Auto-Select Mode
The system SHALL provide an "Auto Select" option that automatically chooses the best (Symbol × Timeframe) configuration instead of requiring manual selection.

#### Scenario: Auto-select triggers backtests
- **WHEN** the user selects Auto Select and starts the bot
- **THEN** the system SHALL execute historical backtests for each supported (Symbol × Timeframe) combination

#### Scenario: Ranking by performance
- **WHEN** all backtests complete
- **THEN** the system SHALL rank combinations by configurable performance metric (default: Sharpe ratio or profit factor)

#### Scenario: Auto-choose top configuration
- **WHEN** ranking is complete
- **THEN** the system SHALL automatically select the best-performing combination

#### Scenario: Configurable evaluation metric
- **WHEN** configuring auto-select
- **THEN** the user SHALL choose which metric to optimize for (Sharpe ratio, profit factor, net profit, win rate)

### Requirement: DEX-Consistent Evaluation
The auto-selection evaluation SHALL consider the selected DEX, its commission model, slippage assumptions, and available historical data.

#### Scenario: DEX-specific evaluation
- **WHEN** auto-select evaluates a combination
- **THEN** it SHALL use the selected DEX's commission model and slippage assumptions

#### Scenario: Commission impact
- **WHEN** computing backtest results for auto-select
- **THEN** the engine SHALL deduct the same fees as live trading would incur

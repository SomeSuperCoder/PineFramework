## Purpose
Implement and verify Strategy Backtest Engine functionality for the strategy-backtest-engine module.

## Requirements

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

### Requirement: Safe Candle Limit
The system SHALL protect against excessive data ingestion by calculating the safe maximum data range algorithmically from a single `SAFE_AMOUNT_OF_CANDLES` constant and the selected timeframe, rather than relying on hardcoded per-timeframe day limits.

#### Scenario: Algorithmic candle-per-day calculation
- **WHEN** the system needs to compute candles per day for a given timeframe
- **THEN** it SHALL calculate it as `(24 * 60) / timeframeMinutes`, with daily timeframes returning 1 and weekly timeframes returning `1/7`.

#### Scenario: Days-back slider bounds
- **WHEN** the user selects the "days back" date range mode
- **THEN** the days-back input SHALL be a slider with:
  - Minimum = `Math.ceil(0.3 * maxSafeDays)`
  - Maximum = `Math.floor(maxSafeDays)`
  where `maxSafeDays = SAFE_AMOUNT_OF_CANDLES / candlesPerDay(timeframe)`.

#### Scenario: Bar estimate exceeds safe limit
- **WHEN** the estimated bar count for the selected date range exceeds `SAFE_AMOUNT_OF_CANDLES`
- **THEN** the system SHALL display a warning and disable the "Run Backtest" button.

#### Scenario: Shared constant used by both frontend and backend
- **WHEN** either the frontend settings UI or the backend backtest service evaluates a safe data range
- **THEN** both SHALL derive their bounds from the same `SAFE_AMOUNT_OF_CANDLES` constant and the algorithmic candle-per-day calculation.

### Requirement: Backtest Request SHALL Require Strategy Source
The backtest API SHALL require a `script` string in the request body when creating a backtest job. A request that omits `script` or sends an empty/non-string `script` SHALL be rejected immediately with an HTTP `400` and an error body shaped like the other request-validation errors — the job SHALL NOT be created and no data fetch SHALL be performed.

#### Scenario: Backtest rejected when script missing
- **WHEN** a client sends `POST /api/backtest` without a `script` field (valid `symbol` and `timeframe`)
- **THEN** the API responds with HTTP `400 { "error": "Missing or invalid \"script\" field" }`
- **AND** no backtest job is created

#### Scenario: Backtest rejected when script empty
- **WHEN** a client sends `POST /api/backtest` with `script: ""` (empty string)
- **THEN** the API responds with HTTP `400` and an error indicating the `script` field is missing or invalid
- **AND** no backtest job is created

#### Scenario: Backtest accepted when script provided
- **WHEN** a client sends `POST /api/backtest` with a non-empty Pine Script `source` as `script`
- **THEN** the API creates a backtest job and returns the job id (existing behavior unchanged)

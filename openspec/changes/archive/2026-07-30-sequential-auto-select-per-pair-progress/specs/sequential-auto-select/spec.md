## MODIFIED Requirements

### Requirement: Auto-Select Mode
The system SHALL provide an "Auto Select" option that automatically chooses the best (Symbol × Timeframe) configuration instead of requiring manual selection.

#### Scenario: Sequential backtest execution
- **WHEN** auto-select is triggered
- **THEN** the system SHALL execute backtests sequentially (one pair at a time), not in parallel

#### Scenario: Candle count per pair
- **WHEN** auto-select fetches bars for a pair
- **THEN** the system SHALL fetch `min(1500, floor(90_days * 24 / timeframe_hours))` candles

#### Scenario: Per-pair progress tracking
- **WHEN** auto-select is evaluating pairs
- **THEN** the system SHALL emit progress events with `candleProgress: { fetched, total }` for the current pair

#### Scenario: Per-pair progress display
- **WHEN** the frontend receives auto-select progress
- **THEN** the system SHALL display individual progress bars for each pair in the status grid

#### Scenario: Status transitions per pair
- **WHEN** a pair begins evaluation
- **THEN** its status SHALL transition: pending → fetching (with candle progress) → backtesting → done/failed

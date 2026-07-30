## ADDED Requirements

### Requirement: Parallel backtest execution
The system SHALL run backtests across all candidate pairs concurrently, bounded by a configurable concurrency limit (default: 4). Bar data fetching SHALL be performed in a separate phase before backtest execution begins.

#### Scenario: Concurrent backtest execution
- **WHEN** auto-select is triggered with N candidates and concurrency limit C
- **THEN** the system fetches bar data for all candidates in parallel (up to C concurrent fetches)
- **AND** once all bar data is loaded, runs backtests in parallel (up to C concurrent backtests)
- **AND** each backtest uses the production `runBacktestPipeline` with DEX-consistent fee evaluation

#### Scenario: Concurrency limit respected
- **WHEN** auto-select is triggered with 10 candidates and concurrency limit 4
- **THEN** at most 4 backtests run simultaneously at any point in time
- **AND** remaining candidates wait until a slot becomes available

#### Scenario: Failed fetch does not block other candidates
- **WHEN** bar data fetch fails for one candidate
- **THEN** that candidate is marked as failed
- **AND** other candidates continue processing without interruption

#### Scenario: Failed backtest does not block other candidates
- **WHEN** backtest execution fails for one candidate
- **THEN** that candidate is marked as failed
- **AND** other candidates continue processing without interruption

### Requirement: Per-pair progress tracking
The system SHALL emit progress events that include the status of every candidate pair, not just a single counter. Each candidate SHALL have a phase (fetching, backtesting, ranking) and a status (pending, active, done, failed).

#### Scenario: Progress events include status map
- **WHEN** auto-select is running
- **THEN** each progress event includes a `statuses` field: `Record<string, { phase: string, status: 'pending'|'active'|'done'|'failed' }>`
- **AND** the `statuses` map is keyed by `"<symbol> (<timeframe>)"` (e.g., `"SOLUSDT (60)"`)

#### Scenario: Status transitions
- **WHEN** a candidate starts fetching bars
- **THEN** its status transitions to `{ phase: 'fetching', status: 'active' }`
- **WHEN** bar fetch completes successfully
- **THEN** its status transitions to `{ phase: 'backtesting', status: 'pending' }`
- **WHEN** backtest starts
- **THEN** its status transitions to `{ phase: 'backtesting', status: 'active' }`
- **WHEN** backtest completes
- **THEN** its status transitions to `{ phase: 'backtesting', status: 'done' }`

#### Scenario: Backward-compatible progress fields
- **WHEN** progress events are emitted
- **THEN** the existing `current`, `total`, `pair`, and `phase` fields ARE preserved alongside the new `statuses` map

### Requirement: Auto-select is always enabled
The system SHALL always use auto-select for pair selection. The manual pair selection UI (PairMatrixTable) SHALL be removed. The "Auto-select" checkbox SHALL be removed from the configuration panel.

#### Scenario: No manual pair selection
- **WHEN** the user opens the bot configuration panel
- **THEN** there is no checkbox or toggle for auto-select
- **AND** there is no table or grid for manually adding/removing trading pairs
- **AND** the pair list is determined automatically by the auto-select system

#### Scenario: Auto-select runs on bot start
- **WHEN** the user clicks "Start Bot"
- **THEN** auto-select automatically evaluates all default candidates
- **AND** the best-performing pair is selected for live trading

### Requirement: Parallel progress display
The frontend SHALL display a grid/table showing all candidate pairs with their real-time evaluation status, replacing the single progress bar.

#### Scenario: Grid displays all candidates
- **WHEN** auto-select is in progress
- **THEN** the frontend renders a table with one row per candidate pair
- **AND** each row shows: symbol, timeframe, phase, and status icon

#### Scenario: Status icons
- **WHEN** a candidate is pending
- **THEN** its row shows a gray dash icon
- **WHEN** a candidate is actively processing
- **THEN** its row shows a spinning indicator
- **WHEN** a candidate completes successfully
- **THEN** its row shows a green checkmark
- **WHEN** a candidate fails
- **THEN** its row shows a red error icon

#### Scenario: Results display after completion
- **WHEN** auto-select completes
- **THEN** the grid shows the final ranking with the best pair highlighted
- **AND** each row displays its key metric value (e.g., profit factor, Sharpe ratio)

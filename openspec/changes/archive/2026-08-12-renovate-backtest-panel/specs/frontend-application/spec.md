## MODIFIED Requirements

### Requirement: Backtest Panel SHALL Select Strategy via Dropdown

The backtest panel SHALL let the user choose which strategy to backtest through a strategy dropdown populated from the strategies API (user scripts + built-ins). The selected strategy's Pine source SHALL be sent as the `script` field of the backtest request. The backtest flow SHALL NOT depend on the chart as the strategy source. The strategy list SHALL load through the same-origin API proxy (relative paths, e.g. `/api/scripts`), so the dropdown works in every access mode where the app itself is reachable, and SHALL recover on reopen after a failed load.

#### Scenario: User selects a strategy and runs backtest

- **WHEN** a user chooses a strategy from the panel's dropdown and clicks run
- **THEN** the backtest request SHALL include the chosen strategy's Pine source as `script`
- **AND** the panel SHALL run the backtest for that strategy regardless of chart state

#### Scenario: Backtest blocked without strategy selection

- **WHEN** a user attempts to run a backtest without a strategy selected
- **THEN** the panel SHALL block the submission
- **AND** SHALL surface a visible message telling the user to select a strategy

#### Scenario: Strategy list loads through same-origin proxy

- **WHEN** the user opens the strategy dropdown in a deployment where the app is reachable (dev via Vite proxy, or prod behind the reverse proxy)
- **THEN** the dropdown SHALL fetch strategies via relative API paths (`/api/scripts`, `/api/scripts/built-in`) and SHALL NOT depend on a hardcoded absolute backend host:port

#### Scenario: Dropdown recovers on reopen after failure

- **WHEN** the initial strategy fetch fails (e.g. transient backend startup) and the user closes and reopens the dropdown
- **THEN** the dropdown SHALL retry the fetch on reopen
- **AND** the previous error state SHALL NOT permanently block loading

### Requirement: Backtest Panel SHALL Show Strategy List States

The backtest panel strategy dropdown SHALL communicate loading, empty, and selection states so the user understands the strategy list status.

#### Scenario: Strategy list loading

- **WHEN** the strategy list is loading
- **THEN** the dropdown SHALL indicate a loading state

#### Scenario: No strategies available

- **WHEN** the strategy list is empty
- **THEN** the dropdown SHALL indicate no strategies are available

## ADDED Requirements

### Requirement: Backtest Panel SHALL Own All Input Values as Independent State

The backtest start panel SHALL hold every input value it uses as independent React state owned by the panel: selected strategy, initial capital (USD), timeframe, trading pair, date range (days-back or explicit range), and commission method. These values SHALL NOT be read-only props inherited from the app header. The panel SHALL pass its own symbol/timeframe up to the run action when a backtest is executed, so the app's live-trading header selection and the panel's backtest selection are decoupled.

#### Scenario: Panel state independent from app header

- **WHEN** the user changes the app header's trading pair or timeframe
- **THEN** the backtest panel's pair/timeframe selections SHALL remain unchanged

#### Scenario: Run uses panel-owned values

- **WHEN** the user clicks Run Backtest
- **THEN** the backtest request SHALL use the panel's own symbol and timeframe (not the header's)

#### Scenario: Panel values persist

- **WHEN** the panel is closed and reopened
- **THEN** the panel SHALL restore its owned values (strategy, capital, timeframe, pair, date range, commission method) from the persisted backtest settings

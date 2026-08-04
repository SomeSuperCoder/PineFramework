## MODIFIED Requirements

### Requirement: Mini chart integrates into LiveDashboard layout
The mini chart SHALL appear in the LiveDashboard's center column when the bot is in Running, Stopping, or Error state. The mini chart SHALL occupy a compact region above the metrics grid, with a fixed or aspect-ratio-constrained height. The mini chart SHALL NOT appear in the Idle/Stopped state (SetupWizard view). The mini chart data pipeline (historical data fetch, script execution, and kline WebSocket subscription) SHALL only run while the mini chart is rendered — it SHALL NOT execute in the Idle/Stopped state, so opening the Bot Dashboard to the Review step without starting the bot SHALL NOT trigger strategy execution or kline streaming.

#### Scenario: Running state layout
- **WHEN** the bot is in Running state
- **THEN** the LiveDashboard center column shows the mini chart at the top, followed by the metrics grid and positions list below it

#### Scenario: Idle state has no mini chart
- **WHEN** the bot is in Idle or Stopped state
- **THEN** the LiveDashboard shows the SetupWizard with no mini chart visible

#### Scenario: No strategy execution in Idle state
- **WHEN** the user opens the Bot Dashboard to the Review step with a saved config and wallet, without starting the bot
- **THEN** the backend does NOT execute the saved strategy
- **AND** the backend does NOT emit `[StrategyEngine]` logs from the saved strategy
- **AND** the frontend does not subscribe to kline topics for the saved pair

#### Scenario: Data pipeline starts only with the mini chart
- **WHEN** the bot transitions from Idle to Running
- **THEN** the mini chart data pipeline begins fetching OHLCV data, executing the strategy, and subscribing to kline updates for the active pair

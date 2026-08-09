# trading-stats-dashboard Specification

## Purpose
Statistics dashboards in the bot UI that visualize global PnL and trading metrics with charts and a browsable trade table, categorized per strategy script, timeframe, and asset. Chaos mode appears as its own strategy.
## Requirements
### Requirement: Trade history view

The bot dashboard SHALL provide a browsable trade-history view listing persisted closed trades with columns for direction, symbol/asset, timeframe, strategy, entry price, exit price, size, PnL, fees, status, open time, and close time. The view SHALL render the NET PnL (`realizedPnl` = gross minus fees) as the PnL column, SHALL render the fee breakdown when available, and SHALL indicate trades flagged `feesUnknown` rather than showing a misleading zero fee. The view SHALL support sorting by column, filtering by strategy, timeframe, asset, and mode (live/chaos/all), and paging through history using the API's cursor pagination. The view SHALL render the same data the history API returns.

#### Scenario: Browse recent trades
WHEN a user opens the trade-history view
THEN the most recent page of trades is displayed, newest first, with all required columns

#### Scenario: Sort by PnL
WHEN a user clicks the PnL column header
THEN the trade list is re-sorted by PnL in the selected direction

#### Scenario: Filter by strategy, timeframe, and asset
WHEN a user sets filters for strategy, timeframe, and asset
THEN only matching trades are displayed

#### Scenario: Toggle live vs chaos
WHEN a user toggles the mode filter to live only
THEN chaos trades are hidden from the list

#### Scenario: Page through history
WHEN a user clicks the next-page control
THEN the next page of trades is fetched and displayed without duplicating or skipping trades

#### Scenario: Unknown-fee trade displayed honestly
WHEN a trade has `feesUnknown: true`
THEN the view SHALL display a fee indicator of unknown rather than a zero fee amount

### Requirement: Statistics dashboard

The bot dashboard SHALL provide a statistics view showing global trading metrics as cards: total trades, win rate, total realized PnL (NET), total fees, net PnL, profit factor, average win, average loss, best trade, worst trade, average trade, and max drawdown. The view SHALL include an equity curve chart of cumulative PnL over time and SHALL support viewing the same metrics grouped by strategy script, by timeframe, and by asset with a PnL comparison chart per group. Chaos mode SHALL be visible as a distinct strategy group ("Chaos Mode") and SHALL be excluded when the user selects live-only mode.

#### Scenario: Global metrics cards render
WHEN a user opens the statistics view
THEN the global metric cards display values computed from the history API's global summary

#### Scenario: Equity curve renders
WHEN a user opens the statistics view
THEN a chart of cumulative PnL over close time is rendered from the trade history

#### Scenario: Group by strategy
WHEN a user selects grouping by strategy
THEN the view shows one metric group per strategy, including "Chaos Mode", with a PnL comparison chart

#### Scenario: Group by timeframe
WHEN a user selects grouping by timeframe
THEN the view shows one metric group per timeframe with a PnL comparison chart

#### Scenario: Group by asset
WHEN a user selects grouping by asset
THEN the view shows one metric group per asset with a PnL comparison chart

#### Scenario: Live-only mode excludes chaos
WHEN a user selects live-only mode
THEN chaos trades are excluded from all displayed metrics, groups, and charts

### Requirement: Live update and refresh

The statistics and history views SHALL reflect newly recorded trades. When the bot is running, the views SHALL update on trade events without a full page reload, and SHALL refetch REST data on WebSocket reconnect so state is never stale.

#### Scenario: New trade appears
WHEN a trade is closed while the bot is running and the dashboard is open
THEN the trade appears in the history view and the statistics update without a manual reload

#### Scenario: Reconnect refreshes data
WHEN the WebSocket reconnects after a drop
THEN the dashboard refetches history and statistics from the API so displayed data is current

### Requirement: Empty and error states

The statistics and history views SHALL render a clear empty state when no trades exist, SHALL render an error state with the message when the API fails, and SHALL never crash or render malformed data on unexpected API responses.

#### Scenario: No trades yet
WHEN a user opens the views and no trades have been recorded
THEN the views render an empty-state message instead of a broken chart or empty table

#### Scenario: API error
WHEN the history or statistics API request fails
THEN the views render an error state with the failure message


# mini-chart Specification

## Purpose

Provides a compact, read-only candlestick chart that displays the most recent candles with indicator plot data, giving users visual confirmation that the trading bot is actively processing market data.
## Requirements
### Requirement: Mini chart displays recent candles

The mini chart SHALL display the last 10–15 candles from the bot's active trading pair and interval. The chart SHALL auto-scale the vertical price axis to fit the visible candle range. The chart SHALL NOT support panning, zooming, or crosshair interaction.

#### Scenario: Bot starts with active strategy

- **WHEN** the bot transitions to the Running state with a configured strategy and active trading pair
- **THEN** the mini chart renders in the LiveDashboard center column showing the most recent 10–15 candles for that pair/interval

#### Scenario: User cannot interact with mini chart

- **WHEN** the user hovers, scrolls, or drags on the mini chart
- **THEN** no pan, zoom, or crosshair response occurs

#### Scenario: Mini chart appears on first start after manual pair selection

- **WHEN** the user completes the SetupWizard Config step, runs a backtest using manual pair selection, confirms the pair on the Review step, and starts the bot for the first time
- **THEN** the bot transitions to Running and the mini chart renders for the manually selected pair/interval without requiring a stop/start cycle or page reload

#### Scenario: Mini chart appears after reload with persisted manual pair

- **WHEN** the bot is configured with a manually selected pair and the user reloads the page
- **THEN** the persisted config loads with the manual pair resolved and the mini chart renders for that pair once the bot is Running

### Requirement: Mini chart renders indicator plot data

The mini chart SHALL overlay the active strategy's indicator plot data (lines, areas, shapes, fills, hlines) on the candlesticks, using the same visual styling as the full chart. The chart SHALL use the same renderers as the full chart to produce identical visual output for the displayed candles.

#### Scenario: Strategy produces plot lines

- **WHEN** the active strategy includes plot() calls that produce visible lines
- **THEN** those lines appear on the mini chart overlaid on the corresponding candles, matching the colors and styles of the full chart

#### Scenario: Strategy produces fills

- **WHEN** the active strategy includes fill() calls between plot series
- **THEN** the fill regions render on the mini chart with the correct gradient and color

### Requirement: Indicator lookback period is satisfied

The mini chart data pipeline SHALL fetch and provide enough historical candles to satisfy the active indicator's lookback period, even though only the last 10–15 candles are rendered. The indicator SHALL be re-executed against the full lookback dataset to produce correct plot values for the visible candles.

#### Scenario: Indicator requires 50-bar lookback

- **WHEN** the active strategy's indicator requires a lookback of 50 bars (e.g., SMA(50))
- **THEN** the mini chart data pipeline fetches at least 50 candles of historical data and executes the script against them
- **AND** only the last 10–15 candles are rendered in the mini chart with correct indicator values

### Requirement: Mini chart updates in real time

The mini chart SHALL update when new candle data arrives via the existing WebSocket stream. The chart SHALL re-render when the forming candle updates tick-by-tick or when a new confirmed candle closes. The chart SHALL NOT re-fetch data independently — it consumes the same data channel as the bot.

#### Scenario: New confirmed candle arrives

- **WHEN** the WebSocket delivers a new confirmed (closed) kline
- **THEN** the mini chart shifts its visible window to show the latest 10–15 candles including the new one

#### Scenario: Forming candle updates

- **WHEN** the WebSocket delivers a tick update for the currently forming candle
- **THEN** the rightmost candle in the mini chart updates its OHLCV values in real time

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

### Requirement: Mini chart uses shared rendering code

The mini chart SHALL reuse the existing PineChart renderers (CandlestickRenderer, LineRenderer, AreaRenderer, MarkerRenderer, HLineRenderer) without duplication. The mini chart component SHALL instantiate PineChart with configuration options that disable interactive features (grid, axis labels, crosshair, time scale, price scale) rather than implementing separate rendering logic.

#### Scenario: Visual parity with full chart

- **WHEN** the same candles and script result are rendered in both the mini chart and the full chart
- **THEN** the candle bodies, wicks, plot lines, and fills appear visually identical (same colors, widths, styles) in both views

### Requirement: Mini chart renders chaos markers instead of the config strategy

When chaos mode is active, the mini chart SHALL NOT execute the configured strategy and SHALL render the chaos markers broadcast by the bot on the `bot:chaosSignal` channel. Chaos markers SHALL be resolved against the full loaded candle window (not only the last N visible candles), against the pair/timeframe actually being traded, and SHALL include both order markers (from `bot:chaosSignal`) and heartbeat outcomes (from `bot:chaosHeartbeat`) so a signal, an explicit no-op, and an error are all visible on the chart.

#### Scenario: Chaos mode active skips strategy execution

- **WHEN** chaos mode is active and the mini chart is mounted
- **THEN** the mini chart SHALL NOT call the script execution endpoint for the configured strategy
- **AND** the configured strategy's plots and labels SHALL NOT appear on the mini chart

#### Scenario: Chaos markers rendered on candles

- **WHEN** the bot broadcasts a chaos marker whose timestamp matches a loaded candle outside the last 12 visible candles
- **THEN** the mini chart SHALL render that marker at the matching candle when that candle becomes visible, using the strategy marker renderer

#### Scenario: Chaos markers render across the full candle window

- **WHEN** the bot broadcasts a chaos marker whose timestamp matches a loaded candle outside the last 12 visible candles
- **THEN** the mini chart SHALL render that marker at the matching candle when that candle becomes visible, using the strategy marker renderer

#### Scenario: Chaos markers match the traded pair

- **WHEN** the mini chart is displaying a pair that matches the pair actually being traded
- **THEN** the chart SHALL render the chaos markers for that pair, regardless of the order or position of pairs in the persisted config

#### Scenario: Heartbeat outcomes visible on chart

- **WHEN** the bot broadcasts a `bot:chaosHeartbeat` with outcome `signal`, `noop`, or `error`
- **THEN** the mini chart SHALL render a marker indicating the outcome at the corresponding candle, so a silent no-op or error is visible rather than indistinguishable from no data

#### Scenario: Chaos mode off keeps current behavior

- **WHEN** chaos mode is inactive
- **THEN** the mini chart SHALL execute and render the configured strategy exactly as before


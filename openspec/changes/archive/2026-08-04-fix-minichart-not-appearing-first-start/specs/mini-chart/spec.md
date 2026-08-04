## MODIFIED Requirements

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

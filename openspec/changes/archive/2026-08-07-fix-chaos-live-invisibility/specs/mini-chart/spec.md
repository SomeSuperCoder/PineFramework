## MODIFIED Requirements

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

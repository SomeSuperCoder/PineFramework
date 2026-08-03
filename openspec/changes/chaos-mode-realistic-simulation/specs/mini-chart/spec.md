## ADDED Requirements

### Requirement: Mini chart renders chaos markers instead of the config strategy
When chaos mode is active, the mini chart SHALL NOT execute the configured strategy and SHALL render the chaos markers broadcast by the bot on the `bot:chaosSignal` channel. The chaos markers SHALL be drawn on the corresponding candles using the existing strategy marker rendering.

#### Scenario: Chaos mode active skips strategy execution
- **WHEN** chaos mode is active and the mini chart is mounted
- **THEN** the mini chart SHALL NOT call the script execution endpoint for the configured strategy
- **AND** the configured strategy's plots and labels SHALL NOT appear on the mini chart

#### Scenario: Chaos markers rendered on candles
- **WHEN** the bot broadcasts a chaos marker whose timestamp matches a displayed candle
- **THEN** the mini chart SHALL render that marker at the matching candle using the strategy marker renderer

#### Scenario: Chaos mode off keeps current behavior
- **WHEN** chaos mode is inactive
- **THEN** the mini chart SHALL execute and render the configured strategy exactly as before

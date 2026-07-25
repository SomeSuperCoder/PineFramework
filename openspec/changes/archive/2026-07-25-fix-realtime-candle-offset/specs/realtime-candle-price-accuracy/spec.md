## ADDED Requirements

### Requirement: Confirmed kline ticks shall reach frontend candle state
The frontend kline message handler SHALL NOT drop confirmed (bar-closing) ticks based on the duplicate-timestamp guard. A confirmed tick carries the final OHLCV values for a candle period and MUST update the candle state even when its timestamp matches a previously seen forming tick.

#### Scenario: Confirmed tick updates existing candle
- **WHEN** the frontend receives a kline message with `confirmed: true` and `timestamp` equal to the last seen kline timestamp
- **THEN** the kline handler SHALL update the corresponding candle in the `candles` state with the confirmed tick's OHLCV values

#### Scenario: Confirmed tick updates ohlcvDataRef
- **WHEN** the frontend receives a kline message with `confirmed: true` and `timestamp` equal to the last seen kline timestamp
- **THEN** the kline handler SHALL update the corresponding entry in `ohlcvDataRef.current` with the confirmed tick's values

#### Scenario: Forming ticks still deduplicated
- **WHEN** the frontend receives a kline message with `confirmed: false` and `timestamp` equal to or less than the last seen kline timestamp
- **THEN** the kline handler SHALL skip the tick (deduplicate)

#### Scenario: Stale replay on reconnect
- **WHEN** the frontend receives a kline message with `timestamp` less than the last seen kline timestamp
- **THEN** the kline handler SHALL skip the tick regardless of confirmed status

### Requirement: Playwright integration test for real-time candle price accuracy
The system SHALL include a Playwright integration test that verifies real-time candles rendered on the chart have prices within tolerance of the confirmed exchange data.

#### Scenario: Test reproduces vertical offset bug
- **WHEN** the test starts a mock WS server that sends forming ticks with intermediate prices followed by a confirmed tick with the correct final price
- **THEN** the test SHALL assert that after the confirmed tick, the last candle's close price matches the confirmed price within tolerance

#### Scenario: Test passes after fix
- **WHEN** the kline handler correctly processes confirmed ticks
- **THEN** the candle's Y-axis position SHALL be consistent with its price (no vertical offset from historical candles)

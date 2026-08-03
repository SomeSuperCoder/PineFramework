## Purpose

Provides real-time OHLCV market data from Bybit via WebSocket for live strategy execution.

## ADDED Requirements

### Requirement: Bybit WebSocket Connection

The system SHALL establish and maintain a WebSocket connection to Bybit's public market data API for receiving real-time candlestick data.

#### Scenario: Connection establishment

- **WHEN** the bot starts with a configured symbol and timeframe
- **THEN** the system SHALL connect to Bybit WebSocket endpoint `wss://stream.bybit.com/v5/public/linear`

#### Scenario: Connection recovery

- **WHEN** the WebSocket connection drops unexpectedly
- **THEN** the system SHALL attempt to reconnect with exponential backoff (max 30 seconds)

#### Scenario: Graceful disconnect

- **WHEN** the bot stops
- **THEN** the system SHALL close the WebSocket connection cleanly

### Requirement: Candle Subscription

The system SHALL subscribe to kline (candlestick) channels for each configured Symbol × Timeframe pair.

#### Scenario: Subscribe to configured pairs

- **WHEN** the bot starts with pairs `[{symbol: "BTCUSDT", timeframe: "60"}, {symbol: "SOLUSDT", timeframe: "15"}]`
- **THEN** the system SHALL subscribe to `kline.60.BTCUSDT` and `kline.15.SOLUSDT` channels

#### Scenario: Multi-pair subscription

- **WHEN** multiple pairs share the same timeframe
- **THEN** the system SHALL batch subscriptions into a single WebSocket message

### Requirement: Candle Confirmation

The system SHALL only process confirmed (closed) candles, not forming candles.

#### Scenario: Confirmed candle processing

- **WHEN** a kline message arrives with `confirm: true`
- **THEN** the system SHALL emit a `ClosedCandle` event with complete OHLCV data

#### Scenario: Forming candle filtering

- **WHEN** a kline message arrives with `confirm: false`
- **THEN** the system SHALL discard the message (no processing)

### Requirement: Candle Data Normalization

The system SHALL normalize Bybit candle data to the internal `ClosedCandle` format.

#### Scenario: Data mapping

- **WHEN** a Bybit kline message is received
- **THEN** the system SHALL map:
  - `start` → `timestamp`
  - `open`, `high`, `low`, `close` → numeric OHLC values
  - `volume` → numeric volume value
  - `symbol` and `timeframe` from subscription context

### Requirement: Historical Candle Fetch

The system SHALL fetch historical candles on startup to warm up strategy state.

#### Scenario: Warmup candle fetch

- **WHEN** the bot starts
- **THEN** the system SHALL fetch the last 200 candles via Bybit REST API for each configured pair

#### Scenario: Warmup completion before live

- **WHEN** historical candles are being fetched
- **THEN** the system SHALL not process live candles until warmup completes

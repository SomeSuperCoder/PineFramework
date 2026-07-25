## MODIFIED Requirements

### Requirement: Bybit Data Integration
The backend SHALL integrate with Bybit APIs for market data (WebSocket stream and REST history) and account operations.

#### Scenario: WebSocket Market Data Stream
- **WHEN** the backend connects to Bybit WebSocket
- **THEN** it SHALL stream real-time klines/ticker data
- **AND** the gateway SHALL validate price values before broadcasting (see realtime-candle-integrity spec)

#### Scenario: REST Historical Data
- **WHEN** historical kline data is requested
- **THEN** the backend SHALL fetch from Bybit REST API
- **AND** the L1 cache SHALL NOT be overwritten by single-bar WebSocket updates

#### Scenario: Account Operations
- **WHEN** order placement or account query is requested
- **THEN** the backend SHALL interact with the Bybit API

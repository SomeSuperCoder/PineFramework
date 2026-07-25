## MODIFIED Requirements

### Requirement: Bybit Data Integration
The backend SHALL integrate with Bybit APIs for market data (WebSocket stream and REST history) and account operations, serving cached historical data from disk when available to reduce redundant API calls.

#### Scenario: WebSocket Market Data Stream
- **WHEN** the backend connects to Bybit WebSocket
- **THEN** it SHALL stream real-time klines/ticker data

#### Scenario: REST Historical Data (modified)
- **WHEN** historical kline data is requested
- **THEN** the backend SHALL first attempt to serve data from the disk cache, falling back to the Bybit REST API only on cache miss or stale data
- **AND** after fetching from the API, the result SHALL be written to both the disk cache and the in-memory cache

#### Scenario: Account Operations
- **WHEN** order placement or account query is requested
- **THEN** the backend SHALL interact with the Bybit API

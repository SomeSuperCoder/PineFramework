## Purpose
Validate incoming kline prices at the gateway and maintain cache integrity during WebSocket updates.

## Requirements

### Requirement: Kline price validation at gateway
The gateway SHALL validate incoming kline prices before broadcast, rejecting ticks where price values are obviously erroneous.

#### Scenario: Absurd price rejected
- **WHEN** a kline tick arrives with `high < low` or `close` differing from the previous close by more than 50%
- **THEN** the gateway SHALL drop the tick and log a warning

#### Scenario: Valid tick passes through
- **WHEN** a kline tick has reasonable prices (within 50% of previous close, high >= low)
- **THEN** the gateway SHALL broadcast the kline as normal

### Requirement: Kline instrumentation logging
The system SHALL log real-time kline price deltas vs. historical data for diagnostic purposes.

#### Scenario: Instrumentation captures delta
- **WHEN** a real-time kline is received
- **THEN** the difference between its close and the last confirmed bar's close SHALL be logged at debug level

### Requirement: Cache integrity
The in-memory OHLCV cache SHALL NOT be overwritten by single-bar WebSocket updates.

#### Scenario: Cache merge preserves history
- **WHEN** the gateway receives a kline tick and calls `cache.set(symbol, interval, [bar])`
- **THEN** the cache SHALL merge the new bar into existing data rather than replacing it

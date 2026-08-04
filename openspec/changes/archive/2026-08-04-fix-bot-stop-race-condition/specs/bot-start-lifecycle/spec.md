## MODIFIED Requirements

### Requirement: Graceful shutdown closes real connections

When the bot stops, the system SHALL gracefully close all real connections: disconnect WebSocket, close DEX connections, cancel pending orders, and persist state. The system SHALL also cancel all in-flight candle processing and signal execution before closing connections. Shutdown SHALL NOT wait for in-flight operations to drain naturally.

#### Scenario: WebSocket disconnect on stop

- **WHEN** the bot stops
- **THEN** the system SHALL close the Bybit WebSocket connection cleanly

#### Scenario: In-flight processing cancelled before disconnect

- **WHEN** the bot stops and candle processing is in-flight
- **THEN** the system SHALL cancel in-flight processing via abort signal before disconnecting the WebSocket

#### Scenario: Position closure on stop

- **WHEN** the bot stops with open positions
- **THEN** the system SHALL close all open positions before transitioning to Stopped state

#### Scenario: State persistence on stop

- **WHEN** the bot stops
- **THEN** the system SHALL persist strategy state and position data to disk

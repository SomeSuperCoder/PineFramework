## MODIFIED Requirements

### Requirement: Chaos mode execution result tracking

The system SHALL track and expose chaos mode execution results including successful orders, failed orders, and total execution time, and SHALL include the full `chaosSignals` history in EVERY `bot:snapshot` broadcast — both the connect-time snapshot and the state-change re-broadcast (e.g., Running transition) — so clients that replace their signal array on snapshot never lose collected markers.

#### Scenario: Execution stats available

- **WHEN** chaos mode has been running for multiple candle closes
- **THEN** the system SHALL track: total signals generated, orders executed, orders failed, total execution time

#### Scenario: Snapshot includes recent chaos markers on connect

- **WHEN** a WebSocket client connects while chaos mode has been active
- **THEN** the `bot:snapshot` payload SHALL include the most recent chaos markers from the in-memory ring buffer

#### Scenario: State-change snapshot preserves chaos markers

- **WHEN** the bot transitions state (e.g., enters Running) and broadcasts a `bot:snapshot`
- **THEN** the snapshot payload SHALL include the full `chaosSignals` history in the same shape as the connect-time snapshot

### Requirement: Chaos history replayed on connect

The system SHALL retain a bounded in-memory history of recent chaos markers and include it in the `bot:snapshot` message sent to a WebSocket client on connect, so a page reload preserves the recent chaos trace. The same complete payload SHALL be produced by a single shared snapshot builder used by every snapshot broadcast site.

#### Scenario: Snapshot includes recent chaos markers

- **WHEN** a WebSocket client connects while chaos mode has been active
- **THEN** the `bot:snapshot` payload SHALL include the most recent chaos markers from the in-memory ring buffer

#### Scenario: Every snapshot broadcast uses the shared builder

- **WHEN** any code path broadcasts a `bot:snapshot`
- **THEN** the payload SHALL be built by the single shared snapshot-payload builder so `chaosSignals` is never omitted

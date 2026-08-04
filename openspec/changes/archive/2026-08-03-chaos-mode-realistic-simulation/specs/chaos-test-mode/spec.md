## ADDED Requirements

### Requirement: Chaos mode simulates a real strategy
When chaos mode is active, the system SHALL simulate a real strategy by driving the strategy engine with random `long`/`short`/`exit` actions rather than emitting raw signals directly. The resulting markers SHALL be produced by the strategy engine itself, so their labels, colors, and types are indistinguishable from a real strategy's output.

#### Scenario: Long entry while flat
- **WHEN** chaos mode generates a `long` action and the simulated position is flat
- **THEN** the strategy engine SHALL produce a genuine entry marker with label `Long`, direction `long`, and the standard long-entry color

#### Scenario: Short while long closes the position
- **WHEN** chaos mode generates a `short` action and the simulated position is long
- **THEN** the strategy engine SHALL close the position, producing a genuine close marker labeled `Exit Short`

#### Scenario: Exit while long closes the position
- **WHEN** chaos mode generates an `exit` action and the simulated position is long
- **THEN** the strategy engine SHALL close the position, producing a genuine close marker

#### Scenario: No marker when the transition is impossible
- **WHEN** chaos mode generates `long` while the simulated position is already long, or `short`/`exit` while the simulated position is flat
- **THEN** the strategy engine SHALL produce no marker for that candle, matching real strategy position-state semantics

### Requirement: Chaos entries are sized at 10% of equity
Every position opened during chaos mode SHALL be sized at exactly 10% of current equity, regardless of any strategy sizing configuration.

#### Scenario: Long entry sized at 10%
- **WHEN** chaos mode opens a long position and current equity is $10,000
- **THEN** the position size SHALL be $1,000 (10% of equity)

#### Scenario: Equity recalculated per entry
- **WHEN** chaos mode opens consecutive positions
- **THEN** each position size SHALL be derived from the current equity at the time of the entry, not the initial capital

### Requirement: Chaos markers broadcast in real time
The system SHALL broadcast every chaos-generated marker over the `bot:chaosSignal` WebSocket channel, including the marker fields produced by the strategy engine (type, name, direction, action, quantity, price, timestamp, color) and its execution result (success or failure, with transaction signature or error on failure).

#### Scenario: Marker broadcast on candle close
- **WHEN** chaos mode produces a marker on a confirmed candle close
- **THEN** the system SHALL broadcast a `bot:chaosSignal` message containing the full marker fields and execution result

#### Scenario: Failed order broadcast with failure state
- **WHEN** a chaos order fails on the DEX (e.g., insufficient balance)
- **THEN** the broadcast SHALL include the failure state and the resulting marker SHALL remain visible on the chart flagged as failed

### Requirement: Chaos history replayed on connect
The system SHALL retain a bounded in-memory history of recent chaos markers and include it in the `bot:snapshot` message sent to a WebSocket client on connect, so a page reload preserves the recent chaos trace.

#### Scenario: Snapshot includes recent chaos markers
- **WHEN** a WebSocket client connects while chaos mode has been active
- **THEN** the `bot:snapshot` payload SHALL include the most recent chaos markers from the in-memory ring buffer

## Purpose

Ensures that when the bot enters the Stopping state, all in-flight candle processing and signal execution is cancelled immediately — not just allowed to drain naturally.

## ADDED Requirements

### Requirement: In-flight candle processing SHALL be cancelled on stop

When the bot transitions to Stopping state, any currently executing `liveTick()` or `tick()` calls SHALL be terminated via an AbortSignal. The system SHALL NOT wait for in-flight candle processing to complete before transitioning to Stopped.

#### Scenario: In-flight liveTick aborted on stop

- **WHEN** the bot is Running and a `liveTick()` call is mid-execution (processing candles or submitting orders)
- **AND** the user triggers stop
- **THEN** the in-flight `liveTick()` SHALL receive an abort signal and terminate
- **AND** the bot SHALL proceed to Stopped state without waiting for the tick to complete

#### Scenario: Multiple concurrent ticks all aborted

- **WHEN** multiple `liveTick()` calls are running concurrently (from rapid candle arrivals)
- **AND** the user triggers stop
- **THEN** ALL in-flight `liveTick()` calls SHALL be aborted
- **AND** no further candle processing SHALL occur after the state transitions to Stopping

### Requirement: Scheduler SHALL check abort signal before processing

The Scheduler's `tick()` method SHALL accept an optional AbortSignal and SHALL throw (or reject) if the signal is already aborted before processing begins. If the signal aborts mid-processing, the scheduler SHALL stop iterating over remaining pairs and return immediately.

#### Scenario: Tick skipped when signal already aborted

- **WHEN** `tick()` is called with an AbortSignal that is already aborted
- **THEN** the method SHALL return immediately without processing any candles or submitting any orders

#### Scenario: Tick aborted mid-processing

- **WHEN** `tick()` is processing pair B of 3 pairs (A, B, C)
- **AND** the AbortSignal fires
- **THEN** pair B processing SHALL complete its current candle (no partial candle)
- **AND** pair C SHALL NOT be processed
- **AND** no orders SHALL be submitted for the partial batch

### Requirement: WebSocket disconnect SHALL stop message processing immediately

When `BybitWebSocketService.disconnect()` is called, the service SHALL stop invoking the candle callback for any messages received after the disconnect call, even if the underlying socket close is asynchronous.

#### Scenario: Messages after disconnect ignored

- **WHEN** `disconnect()` is called
- **AND** a WebSocket message arrives before the socket fully closes
- **THEN** the message SHALL be parsed but the candle callback SHALL NOT be invoked

#### Scenario: Disconnect prevents reconnection

- **WHEN** `disconnect()` is called
- **THEN** the service SHALL NOT attempt to reconnect, even if a close event triggers the reconnect logic

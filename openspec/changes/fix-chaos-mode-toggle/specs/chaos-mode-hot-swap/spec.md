## Purpose

Allows enabling or disabling chaos mode on a running BotEngine, hot-swapping the ChaosSignalGenerator and strategy executor state per pair without requiring a full bot stop/restart cycle.

## ADDED Requirements

### Requirement: Hot-swap chaos mode on running engine

The system SHALL provide a method on BotEngine to toggle chaos mode while the engine is in the Running state, without transitioning through Idle/Stopped.

#### Scenario: Enable chaos mode while running

- **WHEN** `toggleChaosMode(true)` is called on a Running BotEngine with at least one configured pair
- **THEN** the engine creates a `ChaosSignalGenerator` for each configured pair
- **THEN** subsequent candles produce chaos-driven trade signals with genuine strategy markers
- **THEN** chaos signal records are emitted and broadcast via WebSocket

#### Scenario: Disable chaos mode while running

- **WHEN** `toggleChaosMode(false)` is called on a Running BotEngine with chaos mode active
- **THEN** the chaos signal generator is removed from the strategy executor
- **THEN** subsequent candles resume normal strategy execution (if strategy source is configured)
- **THEN** no further chaos signal records are emitted

#### Scenario: Toggle chaos mode when not running

- **WHEN** `toggleChaosMode()` is called on a BotEngine in Idle or Stopped state
- **THEN** the engine updates its internal config and the behavior is the same as calling `configure()` with the updated chaos mode setting

### Requirement: API endpoint supports running-state toggle

The `POST /bot/chaos-mode` endpoint SHALL succeed when the bot is Running, using the hot-swap method instead of requiring `configure()`.

#### Scenario: POST endpoint while bot is Running

- **WHEN** a `POST /bot/chaos-mode` request with `{ enabled: true }` arrives while the bot is in Running state
- **THEN** the endpoint calls `toggleChaosMode(true)` on the engine
- **THEN** returns `{ success: true, chaosMode: { enabled: true } }`

#### Scenario: POST endpoint while bot is Idle

- **WHEN** a `POST /bot/chaos-mode` request arrives while the bot is Idle
- **THEN** the endpoint updates the engine config (existing behavior preserved)
- **THEN** returns `{ success: true, chaosMode: { enabled: true } }`

### Requirement: Frontend toggle calls POST endpoint

The frontend `useChaosMode` hook SHALL call `POST /bot/chaos-mode` to toggle chaos mode, ensuring the running engine is updated immediately.

#### Scenario: User toggles chaos mode while bot is running

- **WHEN** user activates chaos mode via the hidden tap target while the bot is Running
- **THEN** the frontend sends `POST /bot/chaos-mode` with `{ enabled: true }`
- **THEN** chaos markers appear on the mini chart within one candle close
- **THEN** trades are executed according to chaos signals

#### Scenario: User toggles chaos mode while bot is idle

- **WHEN** user activates chaos mode via the hidden tap target while the bot is Idle
- **THEN** the frontend sends `POST /bot/chaos-mode` with `{ enabled: true }`
- **THEN** the preference is persisted for the next bot start

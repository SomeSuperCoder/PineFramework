# chaos-mode-hot-swap Specification

## Purpose
Allows enabling or disabling chaos mode on a running BotEngine, hot-swapping the ChaosSignalGenerator and strategy executor state per pair without requiring a full bot stop/restart cycle.
## Requirements
### Requirement: Hot-swap chaos mode on running engine

The system SHALL provide a method on BotEngine to toggle chaos mode while the engine is in the Running state, without transitioning through Idle/Stopped. Disabling chaos mode SHALL fully restore normal strategy execution: the chaos generator SHALL be removed AND each pair's compiled strategy runtime SHALL be rebuilt, so subsequent candles resume the real strategy path rather than silently producing no signals.

#### Scenario: Enable chaos mode while running

- **WHEN** `toggleChaosMode(true)` is called on a Running BotEngine with at least one configured pair
- **THEN** the engine creates a `ChaosSignalGenerator` for each configured pair
- **THEN** subsequent candles produce chaos-driven trade signals with genuine strategy markers
- **THEN** chaos signal records are emitted and broadcast via WebSocket

#### Scenario: Disable chaos mode while running

- **WHEN** `toggleChaosMode(false)` is called on a Running BotEngine with chaos mode active
- **THEN** the chaos signal generator is removed from the strategy executor
- **THEN** each configured pair's strategy runtime is rebuilt through the non-chaos initialization path
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

### Requirement: Chaos mode toggle persists across restarts

Toggling chaos mode SHALL persist the choice to the bot configuration store, so a restart does not silently revert the mode.

#### Scenario: Toggle persists

- **WHEN** the user toggles chaos mode on or off
- **THEN** the bot configuration store SHALL be updated with the new `chaosMode` value
- **THEN** on the next bot start, the engine SHALL load the persisted value

### Requirement: Chaos mode indicator reflects engine state

The frontend chaos-mode indicator SHALL reflect the running engine's actual chaos mode, not just persisted configuration, so the UI cannot claim chaos is enabled when the engine is running a real strategy.

#### Scenario: Indicator matches engine config

- **WHEN** the engine's internal config differs from the persisted config (e.g. after a configure that dropped the flag)
- **THEN** the indicator SHALL reflect the engine's actual chaos mode
- **AND** the persisted config SHALL be reconciled to the engine's mode


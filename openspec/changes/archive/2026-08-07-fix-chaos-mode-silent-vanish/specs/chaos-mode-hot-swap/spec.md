## MODIFIED Requirements

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

## ADDED Requirements

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

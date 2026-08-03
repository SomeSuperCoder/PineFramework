## MODIFIED Requirements

### Requirement: Start precondition — autoSelect must be resolved

The system SHALL refuse to start the bot when `config.autoSelect` is `true`. The `start()` method SHALL check that auto-selection has already been completed (pairs resolved, `autoSelect` set to `false`) before proceeding. This ensures `start()` never blocks on an inline market selection that can take minutes or hang indefinitely.

#### Scenario: Start rejected when autoSelect is still enabled

- **WHEN** `engine.start()` is called and `config.autoSelect` is `true`
- **THEN** the system SHALL throw an error with a message indicating that auto-selection must be resolved before starting, and the engine state SHALL remain `Idle`

#### Scenario: Start proceeds when autoSelect is disabled and pairs are configured

- **WHEN** `engine.start()` is called and `config.autoSelect` is `false` and `config.pairs` is a non-empty array
- **THEN** the system SHALL proceed with the normal state transition (`Idle` → `Starting` → `Running`) without running auto-selection

### Requirement: Start initialization connects real components

When the bot starts, the system SHALL initialize all real trading components: compile the strategy, connect to Bybit WebSocket for live bars, establish DEX connection, load wallet, and start the position scheduler. The system SHALL NOT use placeholder initialization.

#### Scenario: Strategy compilation on start

- **WHEN** the bot starts with a configured strategy source
- **THEN** the system SHALL compile the Pine Script strategy and load it for live execution

#### Scenario: Bar feed connection on start

- **WHEN** the bot starts
- **THEN** the system SHALL connect to Bybit WebSocket and begin receiving live candles for configured pairs

#### Scenario: DEX connection on start

- **WHEN** the bot starts
- **THEN** the system SHALL initialize the Jupiter DEX adapter and verify API connectivity

#### Scenario: Wallet loading on start

- **WHEN** the bot starts with a configured wallet public key
- **THEN** the system SHALL load the encrypted keypair and verify it matches the public key

#### Scenario: Scheduler startup on start

- **WHEN** all components are initialized
- **THEN** the system SHALL start the position scheduler with configured pairs

#### Scenario: Initialization failure

- **WHEN** any component fails to initialize (compilation error, WebSocket connection failure, DEX unavailability, wallet not found)
- **THEN** the system SHALL transition to Error state with a descriptive error message

## ADDED Requirements

### Requirement: Graceful shutdown closes real connections

When the bot stops, the system SHALL gracefully close all real connections: disconnect WebSocket, close DEX connections, cancel pending orders, and persist state.

#### Scenario: WebSocket disconnect on stop

- **WHEN** the bot stops
- **THEN** the system SHALL close the Bybit WebSocket connection cleanly

#### Scenario: Position closure on stop

- **WHEN** the bot stops with open positions
- **THEN** the system SHALL close all open positions before transitioning to Stopped state

#### Scenario: State persistence on stop

- **WHEN** the bot stops
- **THEN** the system SHALL persist strategy state and position data to disk

### Requirement: Emergency stop closes real positions

When emergency stop is triggered, the system SHALL immediately close all open positions via real DEX swaps and halt all pending operations.

#### Scenario: Emergency stop closes positions

- **WHEN** emergency stop is triggered
- **THEN** the system SHALL execute market orders to close all open positions at current market price

#### Scenario: Emergency stop cancels pending orders

- **WHEN** emergency stop is triggered
- **THEN** the system SHALL cancel all pending limit orders on the DEX

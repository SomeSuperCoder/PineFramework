## Purpose

Defines the preconditions and error behavior for starting the trading bot, ensuring `engine.start()` never silently blocks on long-running operations like auto-selection.

## Requirements

### Requirement: Start precondition — autoSelect must be resolved

The system SHALL allow starting the bot when `config.pairs` is a non-empty array, regardless of the `autoSelect` flag value. When `config.autoSelect` is `true` and `config.pairs` is empty, the system SHALL refuse to start and require auto-selection to run first. When `config.autoSelect` is `true` and `config.pairs` is non-empty, the system SHALL skip auto-selection and use the configured pairs directly.

#### Scenario: Start rejected when autoSelect is true and no pairs configured

- **WHEN** `engine.start()` is called and `config.autoSelect` is `true` and `config.pairs` is empty or undefined
- **THEN** the system SHALL throw an error with a message indicating that auto-selection must be resolved before starting, and the engine state SHALL remain `Idle`

#### Scenario: Start proceeds when autoSelect is true but pairs are already configured

- **WHEN** `engine.start()` is called and `config.autoSelect` is `true` and `config.pairs` is a non-empty array
- **THEN** the system SHALL proceed with the normal state transition (`Idle` → `Starting` → `Running`) without running auto-selection

#### Scenario: Start proceeds when autoSelect is disabled and pairs are configured

- **WHEN** `engine.start()` is called and `config.autoSelect` is `false` and `config.pairs` is a non-empty array
- **THEN** the system SHALL proceed with the normal state transition (`Idle` → `Starting` → `Running`) without running auto-selection

#### Scenario: Start rejected when autoSelect is disabled and no pairs configured

- **WHEN** `engine.start()` is called and `config.autoSelect` is `false` and `config.pairs` is empty or undefined
- **THEN** the system SHALL throw an error indicating that no trading pairs are configured

### Requirement: Post-backtest config persistence

When an auto-selection backtest completes, the system SHALL persist the final configuration (with `autoSelect: false` and the resolved pairs) to disk. This ensures that the persisted config reflects the actual selection state and prevents stale `autoSelect: true` from reintroducing the blocking behavior on server restart.

#### Scenario: Config persisted after backtest completes

- **WHEN** the `/bot/backtest` endpoint completes auto-selection successfully
- **THEN** the system SHALL save the updated configuration (with `autoSelect: false` and the selected pairs) to the config store on disk

#### Scenario: Persisted config on restart reflects selection state

- **WHEN** the backend server restarts and loads the persisted bot configuration
- **THEN** the configuration SHALL have `autoSelect: false` if a backtest had previously completed, and the resolved pairs SHALL be available for `engine.start()`

### Requirement: Start error surfaced via HTTP response

When `engine.start()` fails due to a precondition violation, the `POST /api/bot/start` endpoint SHALL return an HTTP 400 response with a descriptive error message. The system SHALL NOT leave the HTTP connection hanging without a response.

#### Scenario: HTTP 400 returned on precondition failure

- **WHEN** `POST /api/bot/start` is called and `engine.start()` throws due to autoSelect precondition
- **THEN** the endpoint SHALL respond with HTTP status 400 and a JSON body containing `{ "success": false, "error": "<descriptive message>" }`

#### Scenario: HTTP 200 returned on successful start

- **WHEN** `POST /api/bot/start` is called and `engine.start()` completes successfully
- **THEN** the endpoint SHALL respond with HTTP status 200 and a JSON body containing `{ "success": true, "state": "<current state>" }`

### Requirement: Start error message surfaced to user

When `POST /api/bot/start` fails and returns an error message, the frontend Review step SHALL display the backend's specific error message to the user, not a generic string. The message SHALL be shown in the existing error display area below the Start button.

#### Scenario: Specific error shown on start failure

- **WHEN** the user clicks "Start Bot" on the Review step and the backend returns HTTP 400 with `{ "error": "<message>" }`
- **THEN** the error display area SHALL show the value of `<message>` from the response, not a hardcoded generic string

#### Scenario: Start button re-enabled after error

- **WHEN** the start fails and the error message is displayed
- **THEN** the Start button SHALL be re-enabled (not stuck in "Starting..." state)

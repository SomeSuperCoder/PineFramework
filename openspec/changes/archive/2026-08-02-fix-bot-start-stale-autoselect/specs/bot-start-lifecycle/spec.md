## Purpose

Defines the preconditions and error behavior for starting the trading bot, ensuring `engine.start()` never silently blocks on long-running operations like auto-selection.

## ADDED Requirements

### Requirement: Start precondition — autoSelect must be resolved

The system SHALL refuse to start the bot when `config.autoSelect` is `true`. The `start()` method SHALL check that auto-selection has already been completed (pairs resolved, `autoSelect` set to `false`) before proceeding. This ensures `start()` never blocks on an inline market selection that can take minutes or hang indefinitely.

#### Scenario: Start rejected when autoSelect is still enabled

- **WHEN** `engine.start()` is called and `config.autoSelect` is `true`
- **THEN** the system SHALL throw an error with a message indicating that auto-selection must be resolved before starting, and the engine state SHALL remain `Idle`

#### Scenario: Start proceeds when autoSelect is disabled and pairs are configured

- **WHEN** `engine.start()` is called and `config.autoSelect` is `false` and `config.pairs` is a non-empty array
- **THEN** the system SHALL proceed with the normal state transition (`Idle` → `Starting` → `Running`) without running auto-selection

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

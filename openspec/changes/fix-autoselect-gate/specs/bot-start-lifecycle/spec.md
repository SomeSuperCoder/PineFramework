## MODIFIED Requirements

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

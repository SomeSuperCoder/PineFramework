## MODIFIED Requirements

### Requirement: Start precondition — autoSelect must be resolved

The system SHALL allow starting the bot when `config.pairs` is a non-empty array, regardless of the `autoSelect` flag value. When `config.autoSelect` is `true` and `config.pairs` is empty, the system SHALL invoke the auto-selection callback (`onAutoSelect`) to resolve pairs; if no callback is configured, the system SHALL throw an error indicating auto-selection returned no pairs. When `config.autoSelect` is `true` and `config.pairs` is non-empty, the system SHALL skip auto-selection and use the configured pairs directly.

#### Scenario: Start rejects when autoSelect is true and no callback configured

- **WHEN** `engine.start()` is called and `config.autoSelect` is `true` and `config.pairs` is empty or undefined and no auto-select callback is configured
- **THEN** the system SHALL throw an error with message indicating auto-selection returned no pairs
- **AND** the engine state SHALL remain `Idle`

#### Scenario: Auto-select callback invoked when pairs empty

- **WHEN** `engine.start()` is called and `config.autoSelect` is `true` and `config.pairs` is empty or undefined and an auto-select callback is configured
- **THEN** the system SHALL invoke the callback to resolve pairs before proceeding with the state transition

#### Scenario: Start proceeds when autoSelect is true but pairs are already configured

- **WHEN** `engine.start()` is called and `config.autoSelect` is `true` and `config.pairs` is a non-empty array
- **THEN** the system SHALL proceed with the normal state transition (`Idle` → `Starting` → `Running`) without running auto-selection

#### Scenario: Start proceeds when autoSelect is disabled and pairs are configured

- **WHEN** `engine.start()` is called and `config.autoSelect` is `false` and `config.pairs` is a non-empty array
- **THEN** the system SHALL proceed with the normal state transition (`Idle` → `Starting` → `Running`) without running auto-selection

#### Scenario: Start rejected when autoSelect is disabled and no pairs configured

- **WHEN** `engine.start()` is called and `config.autoSelect` is `false` and `config.pairs` is empty or undefined
- **THEN** the system SHALL throw an error indicating that no trading pairs are configured

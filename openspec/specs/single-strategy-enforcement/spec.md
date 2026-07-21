## Purpose
Implement and verify Single Strategy Enforcement functionality for the single-strategy-enforcement module.

## Requirements

### Requirement: Single Strategy Enforcement
The engine SHALL enforce that only one strategy() declaration can exist per script.

#### Scenario: Strategy Validation
- **WHEN** a script contains more than one strategy() declaration
- **THEN** the engine SHALL produce a compilation error

#### Scenario: Strategy-Indicator Conflict
- **WHEN** a script contains both strategy() and indicator()
- **THEN** the engine SHALL produce a compilation error

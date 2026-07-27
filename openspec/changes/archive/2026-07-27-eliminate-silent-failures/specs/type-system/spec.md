## MODIFIED Requirements

### Requirement: NA Value Semantics
The type system SHALL implement Pine's `na` (not available) value semantics, and SHALL report errors when type invariants are violated at runtime.

#### Scenario: NA Propagation
- **WHEN** operations involve `na` values
- **THEN** the type system SHALL follow Pine's na propagation rules

#### Scenario: Type Error Messages Include Context
- **WHEN** a type error occurs at compile time
- **THEN** the type system SHALL provide clear, descriptive error messages with source span

#### Scenario: Runtime type mismatch throws structured error
- **WHEN** a runtime operation receives a PineValue of unexpected type
- **THEN** the executor SHALL throw a structured error with source context rather than silently returning NA or crashing

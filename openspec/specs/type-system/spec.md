## Purpose
Implement and verify Primitive Type Support functionality for the type-system module.

## Requirements

### Requirement: Primitive Type Support
The type system SHALL support all Pine primitive types (int, float, bool, string, color) with automatic type coercion following Pine Script rules.

#### Scenario: Primitive Type Declaration
- **WHEN** a variable is declared with a primitive type
- **THEN** the type system SHALL enforce type constraints

#### Scenario: Automatic Type Coercion
- **WHEN** operations mix compatible types
- **THEN** the type system SHALL apply Pine's automatic coercion rules (v5 looser, v6 stricter)

#### Scenario: Version-Aware Coercion
- **WHEN** running in v5 mode
- **THEN** the type system SHALL allow implicit int/float conversions where v5 permits them

#### Scenario: Version-Aware Coercion v6
- **WHEN** running in v6 mode
- **THEN** the type system SHALL enforce stricter type boundaries

#### Scenario: Type Error Messages
- **WHEN** a type error occurs
- **THEN** the type system SHALL provide clear, descriptive error messages

### Requirement: Series and Collection Types
The type system SHALL implement Series types for time-series data and support array/map data structures with generic operations.

#### Scenario: Series Type Behavior
- **WHEN** a Series type is used
- **THEN** the type system SHALL maintain time-series semantics

#### Scenario: Array Operations
- **WHEN** array methods are called (size, first, last, shift, pop, push, unshift, insert, remove, contains, fill, set, get, sort, copy)
- **THEN** the type system SHALL support all generic array operations

#### Scenario: Map Operations
- **WHEN** map data structures are used
- **THEN** the type system SHALL support map operations

### Requirement: NA Value Semantics
The type system SHALL implement Pine's `na` (not available) value semantics.

#### Scenario: NA Propagation
- **WHEN** operations involve `na` values
- **THEN** the type system SHALL follow Pine's na propagation rules

#### Scenario: NA in Logical Operations
- **WHEN** logical AND/OR has `na` operands
- **THEN** the type system SHALL treat `na` as false (Pine Script boolean semantics)

### Requirement: Simple Type Qualifier
The type system SHALL support the `simple` type qualifier as a prefix to type declarations, similar to the `series` qualifier.

#### Scenario: Simple Type Declaration
- **WHEN** `simple string` or `simple int` is used
- **THEN** the type system SHALL recognize it as a valid type qualifier

### Requirement: User-Defined Types
The type system SHALL support user-defined types via type aliases.

#### Scenario: Type Alias
- **WHEN** a type alias is defined
- **THEN** the type system SHALL recognize and enforce the alias

### Requirement: Method Dispatch on Numeric IDs
The type system SHALL support method dispatch on numeric IDs for line and label objects, enabling chained operations.

#### Scenario: Line Method Dispatch
- **WHEN** a method is called on a line object ID (e.g., `lin.shift().delete()`)
- **THEN** the type system SHALL dispatch to the appropriate line method

#### Scenario: Label Method Dispatch
- **WHEN** a method is called on a label object ID
- **THEN** the type system SHALL dispatch to the appropriate label method

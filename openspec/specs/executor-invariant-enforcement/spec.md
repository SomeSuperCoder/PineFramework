## Purpose
Validate runtime invariants during expression evaluation and report failures through structured errors rather than silently corrupting state.

## Requirements

### Requirement: Runtime type invariant guards
The expression executor SHALL validate that every arithmetic, comparison, and logic operation receives PineValue inputs of the expected type and produces a finite numeric result where appropriate. Unexpected non-finite values (NaN, Infinity, -Infinity) SHALL produce a `RuntimeError` in non-arithmetic contexts.

#### Scenario: Arithmetic operation with non-number inputs
- **WHEN** a binary arithmetic expression receives non-number PineValues
- **THEN** the executor SHALL return NA (Pine Script semantics) rather than crashing

#### Scenario: Unexpected NaN/Infinity in non-arithmetic context
- **WHEN** a NaN or Infinity value is produced outside a known arithmetic path (e.g., series indexing, type coercion)
- **THEN** the executor SHALL throw a `RuntimeError` with source span and bar index

#### Scenario: Division by zero
- **WHEN** a division or modulo by zero occurs
- **THEN** the executor SHALL return NA (Pine Script semantics) via the safe arithmetic guards

### Requirement: OHLC data ingestion validation
The interpreter SHALL validate that OHLC values pushed into history arrays are finite numbers. Non-numeric or non-finite values SHALL produce a warning and be coerced to 0, but the engine SHALL NOT silently use stale or undefined values.

#### Scenario: Valid numeric OHLC
- **WHEN** all OHLC values are finite numbers
- **THEN** they SHALL be pushed directly to history arrays

#### Scenario: NaN/Infinity OHLC value
- **WHEN** an OHLC value is NaN, Infinity, or -Infinity
- **THEN** the interpreter SHALL emit a diagnostic warning and push 0 instead

#### Scenario: Non-numeric OHLC value
- **WHEN** an OHLC value is `undefined`, `null`, or a non-number type
- **THEN** the interpreter SHALL emit a diagnostic warning and push 0 instead

### Requirement: Series indexing guard
Series indexing (e.g., `close[1]`) SHALL return NA when the index references a bar before the start of the series, rather than returning `undefined` or a stale value.

#### Scenario: Valid series index
- **WHEN** an index is within the series bounds
- **THEN** the executor SHALL return the expected value

#### Scenario: Out-of-bounds series index
- **WHEN** an index references a negative offset beyond available series history
- **THEN** the executor SHALL return NA

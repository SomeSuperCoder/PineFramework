## Purpose
Audit IEEE 754 floating-point arithmetic behavior across the runtime engine for compatibility with PineScript.

## Requirements

### Requirement: IEEE 754 Arithmetic Compatibility
The engine SHALL handle floating-point arithmetic in a manner compatible with PineScript's IEEE 754 behavior, and SHALL guard against silent propagation of non-finite values outside known arithmetic paths.

#### Scenario: Floating point operations match PineScript
- **WHEN** arithmetic operations are performed
- **THEN** results SHALL match PineScript's IEEE 754 rounding and precision behavior

#### Scenario: Division by zero returns NA
- **WHEN** division by zero is encountered
- **THEN** the engine SHALL return NA (PineScript semantics), not Infinity

#### Scenario: NaN in arithmetic context returns NA
- **WHEN** a NaN value is produced by an arithmetic operation
- **THEN** the engine SHALL convert it to NA via the float guards

#### Scenario: NaN/Infinity in non-arithmetic context throws
- **WHEN** a NaN or Infinity value is unexpectedly encountered outside a known arithmetic path (e.g., in series indexing, OHLC ingestion, or type coercion)
- **THEN** the engine SHALL throw a structured error with source context rather than silently propagating the non-finite value

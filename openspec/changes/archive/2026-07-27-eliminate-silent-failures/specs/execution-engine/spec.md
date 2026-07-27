## MODIFIED Requirements

### Requirement: Execution Result Types
The engine SHALL return shapes, fills, strategyMarkers, lines, labels, and barColorData as part of the execution result, and SHALL return structured error information on failure.

#### Scenario: Shape Outputs
- **WHEN** plotshape() is called
- **THEN** the engine SHALL include shape entries in the execution result

#### Scenario: Fill Outputs
- **WHEN** fill() is called
- **THEN** the engine SHALL include fill entries in the execution result

#### Scenario: Strategy Marker Outputs
- **WHEN** strategy functions are used
- **THEN** the engine SHALL include strategy markers in the execution result

#### Scenario: Line and Label Outputs
- **WHEN** line.new() or label.new() is called
- **THEN** the engine SHALL include line/label entries in the execution result

#### Scenario: Bar Color Data
- **WHEN** barcolor() is called
- **THEN** the engine SHALL include `barColorData` (array of `{time, color}`) in the execution result

#### Scenario: Structured Error on Failure
- **WHEN** an execution error occurs
- **THEN** the execution result SHALL contain `success: false` and `error` as an `EngineError` object with `message` and `barIndex` fields

## ADDED Requirements

### Requirement: EngineError Structure
The engine SHALL use a structured `EngineError` type for runtime errors, containing at minimum a human-readable message and the bar index where the error occurred.

#### Scenario: EngineError has message and barIndex
- **WHEN** a runtime error occurs
- **THEN** the `EngineError` SHALL contain `message: string` and `barIndex: number`

#### Scenario: EngineError is string-coercible
- **WHEN** an `EngineError` is used in string context
- **THEN** it SHALL produce its message string (backward-compatible with existing string-based error consumers)

### Requirement: Runtime invariant guards
The execution engine SHALL validate runtime invariants during expression evaluation and report failures through structured errors rather than silently corrupting state.

#### Scenario: Non-finite value in non-arithmetic context
- **WHEN** a NaN or Infinity value would propagate outside a known arithmetic path
- **THEN** the executor SHALL throw a `RuntimeError` with source context

#### Scenario: Division by zero returns NA
- **WHEN** a division or modulo operation divides by zero
- **THEN** the executor SHALL return NA (Pine Script semantics)

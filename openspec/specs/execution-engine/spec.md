## Purpose
Implement and verify Bar-by-Bar Execution functionality for the execution-engine module.

## Requirements

### Requirement: Bar-by-Bar Execution
The execution engine SHALL execute Pine Script programs bar-by-bar, maintaining series state across historical bars and updating calculations on realtime bars.

#### Scenario: Historical Bar Processing
- **WHEN** processing historical bars
- **THEN** the engine SHALL execute bar-by-bar from oldest to newest while maintaining series state

#### Scenario: Realtime Bar Updates
- **WHEN** realtime bars arrive
- **THEN** the engine SHALL update calculations for the new bar

#### Scenario: Error Rollback
- **WHEN** execution errors occur during realtime processing
- **THEN** the engine SHALL roll back to the previous valid state

#### Scenario: Script Re-Execution
- **WHEN** a new bar opens
- **THEN** the engine SHALL support re-execution on each new bar

#### Scenario: Variable Scope
- **WHEN** executing across bars
- **THEN** the engine SHALL maintain variable scope across script execution

#### Scenario: Series Indexing
- **WHEN** series indexing (e.g., `close[1]`) is used
- **THEN** the engine SHALL access previous bar values from the accumulated history

#### Scenario: For-Loop Inclusive Iteration
- **WHEN** a `for i = 0 to end` loop is used
- **THEN** the engine SHALL include the `end` value in iteration

### Requirement: Execution Result Types
The engine SHALL return shapes, fills, strategyMarkers, lines, labels, and barColorData as part of the execution result.

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

### Requirement: Named Arguments and Auto-Detection
The engine SHALL support named arguments forwarding to built-in functions and auto-detect plot titles from variable names.

#### Scenario: Named Arguments Forwarding
- **WHEN** a built-in function is called with named arguments
- **THEN** the engine SHALL forward named arguments to the function

#### Scenario: Auto-Detect Plot Title
- **WHEN** plot() is called without an explicit title
- **THEN** the engine SHALL auto-detect the title from the variable name

### Requirement: Var/Varip Persistence
The engine SHALL maintain var and varip variable state across bars without resetting on re-declaration.

#### Scenario: Var Persistence
- **WHEN** a var variable is declared across multiple bars
- **THEN** the engine SHALL preserve its value between bar executions

#### Scenario: Varip Persistence
- **WHEN** a varip variable is declared
- **THEN** the engine SHALL preserve its value across realtime ticks

### Requirement: Incremental Realtime Execution
The engine SHALL support incremental real-time bar execution via `executeRealtimeBar()` and forming-candle computation via `computeFormingCandle()`.

#### Scenario: Realtime Bar Execution
- **WHEN** `executeRealtimeBar()` is called with a new bar
- **THEN** the engine SHALL process only the new bar while preserving prior state

#### Scenario: State Snapshot Management
- **WHEN** real-time updates occur
- **THEN** the engine SHALL create state snapshots for rollback capability

#### Scenario: Forming Candle Computation
- **WHEN** `computeFormingCandle()` is called
- **THEN** the engine SHALL re-evaluate only the last (live) bar without reprocessing historical bars

#### Scenario: Caller-Controlled Forming Flag
- **WHEN** `setFormingCandle(true|false)` is called by the caller
- **THEN** the engine SHALL use the externally-set flag, with `barstate.isconfirmed` resolving to `!this.isFormingCandle`

### Requirement: Built-in Namespace Support
The engine SHALL support the syminfo namespace and other built-in read-only variables.

#### Scenario: Syminfo Namespace
- **WHEN** syminfo.tickerid, syminfo.mintick, syminfo.pointvalue, syminfo.pricescale, or syminfo.currency is accessed
- **THEN** the engine SHALL resolve them as built-in read-only variables

### Requirement: Strict Comparison Semantics
The engine SHALL implement strict comparisons matching TradingView semantics for crossover/crossunder and pivot functions.

#### Scenario: Crossover Strict Comparison
- **WHEN** ta.crossover() is evaluated
- **THEN** the engine SHALL use <= on the previous bar comparison (prev src <= prev cmp)

#### Scenario: Crossunder Strict Comparison
- **WHEN** ta.crossunder() is evaluated
- **THEN** the engine SHALL use >= on the previous bar comparison (prev src >= prev cmp)

#### Scenario: Pivot High Strict Comparison
- **WHEN** ta.pivothigh() is evaluated
- **THEN** the engine SHALL use strict greater-than (>)

#### Scenario: Pivot Low Strict Comparison
- **WHEN** ta.pivotlow() is evaluated
- **THEN** the engine SHALL use strict less-than (<)

### Requirement: Compound Assignment and Const
The engine SHALL execute compound assignment operators (`+=`, `-=`, `*=`, `/=`) and support `const` variable declarations.

#### Scenario: Compound Assignment Execution
- **WHEN** a compound assignment operator is used
- **THEN** the engine SHALL read the current series value, apply the operator, and push the result

#### Scenario: Const Variable Declaration
- **WHEN** a `const` variable is declared
- **THEN** the engine SHALL mark it as immutable after initialization and prevent reassignment

### Requirement: Switch Expression as Return Value
WHEN a switch expression is used as a function return value (arrow-syntax switch), THE engine SHALL return the last statement result of the matched case body as the expression value instead of NA.

#### Scenario: Switch Expression Return
- **WHEN** a switch with arrow syntax (`"EMA" => ta.ema(...)`) is used as a return value
- **THEN** the engine SHALL return the computed expression value from the matched case

## ADDED Requirements

### Requirement: Compiler rejects type mismatches with clear errors
The compiler SHALL reject Pine Script programs with invalid type annotations or type mismatches, producing descriptive CompileErrors rather than silently producing broken IR.

#### Scenario: Assign string to float variable
- **WHEN** a variable annotated `float` is assigned a string value
- **THEN** the compiler SHALL throw a CompileError

#### Scenario: Assign float to string variable
- **WHEN** a variable annotated `string` is assigned a numeric expression
- **THEN** the compiler SHALL throw a CompileError

#### Scenario: Series type mismatch
- **WHEN** a `series<float>` expression is assigned to a non-series `int` variable
- **THEN** the compiler SHALL throw a CompileError

#### Scenario: Undefined variable reference
- **WHEN** a script references a variable that has not been declared
- **THEN** the compiler SHALL throw a CompileError

#### Scenario: Type annotation mismatch on function parameter
- **WHEN** a function parameter has a type annotation but receives incompatible argument
- **THEN** the compiler SHALL throw a CompileError

#### Scenario: Array type annotation mismatch
- **WHEN** an array literal contains types incompatible with its annotation
- **THEN** the compiler SHALL throw a CompileError

#### Scenario: Map key/value type mismatch
- **WHEN** a map literal has key/value types incompatible with its annotation
- **THEN** the compiler SHALL throw a CompileError

#### Scenario: Self-referencing variable declaration
- **WHEN** a variable initializer references itself (e.g., `x = x + 1`)
- **THEN** the compiler SHALL throw a CompileError about undefined variable

#### Scenario: Invalid operator types
- **WHEN** a binary operator is applied to incompatible operand types (e.g., `"a" - "b"`)
- **THEN** the compiler SHALL throw a CompileError

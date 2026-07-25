## ADDED Requirements

### Requirement: Exhaustive expression type inference
The compiler's `inferExpressionType` method SHALL use exhaustive matching over all known `ExpressionNode` kinds. Any expression kind not explicitly handled SHALL produce a `CompileError` at compile time, not a silent default type.

#### Scenario: Handled expression kinds
- **WHEN** `inferExpressionType` encounters a known expression kind
- **THEN** it SHALL return the correct inferred `PineType`

#### Scenario: Unrecognised expression kind
- **WHEN** `inferExpressionType` encounters an expression kind not covered by any switch case
- **THEN** it SHALL throw a `CompileError` with a message identifying the unrecognised kind and its source span

### Requirement: Assignment target validation
The compiler SHALL validate that assignment targets are assignable l-values before emitting IR. Non-identifier targets that cannot be assigned to SHALL produce a `CompileError`.

#### Scenario: Assignable identifier target
- **WHEN** an assignment target is a simple identifier
- **THEN** the compiler SHALL proceed normally

#### Scenario: Non-assignable member expression target
- **WHEN** an assignment target is a member expression that cannot be assigned to
- **THEN** the compiler SHALL throw a `CompileError`

#### Scenario: Index expression as assignment target
- **WHEN** an assignment target is an index expression on a mutable collection
- **THEN** the compiler SHALL validate the target type and emit IR if mutable, or throw `CompileError` if not

### Requirement: Control flow statement compilation validation
The compiler SHALL validate that control flow statements (if, for, while, switch, return, break, continue) are used in valid contexts. Currently these are no-ops — each SHALL produce a `CompileError` or be properly compiled (not silently skipped).

#### Scenario: Return outside function context
- **WHEN** a `return` statement appears outside any function body
- **THEN** the compiler SHALL throw a `CompileError`

#### Scenario: Break outside loop context
- **WHEN** a `break` statement appears outside a for/while loop
- **THEN** the compiler SHALL throw a `CompileError`

#### Scenario: Continue outside loop context
- **WHEN** a `continue` statement appears outside a for/while loop
- **THEN** the compiler SHALL throw a `CompileError`

## ADDED Requirements

### Requirement: No silent recovery from malformed input
The parser SHALL NOT silently recover from any malformed input in a way that produces a partial or incomplete AST without reporting an error. Every invalid token sequence, malformed expression, or incomplete construct SHALL produce a `ParseError` with source location.

#### Scenario: Malformed expression produces ParseError
- **WHEN** an expression is syntactically invalid (e.g., unmatched parentheses, missing operand)
- **THEN** the parser SHALL throw a `ParseError` with a descriptive message and source span instead of returning a partial AST

#### Scenario: Incomplete type annotation produces ParseError
- **WHEN** a type annotation is incomplete (e.g., `series<int` without closing `>`)
- **THEN** the parser SHALL throw a `ParseError` with source location

#### Scenario: Unknown token in expression context produces ParseError
- **WHEN** a token that cannot start any valid expression is encountered in expression context
- **THEN** the parser SHALL throw a `ParseError` rather than skipping the token

#### Scenario: Unterminated block produces ParseError
- **WHEN** a function body or indented block reaches EOF without finding its closing construct
- **THEN** the parser SHALL throw a `ParseError` with source location

### Requirement: Descriptive error messages carry source context
Every `ParseError` SHALL include a human-readable message and the exact `SourceSpan` (start/end line and column) of the offending construct.

#### Scenario: Error message references source location
- **WHEN** a `ParseError` is thrown
- **THEN** the error SHALL contain both a message and a `SourceSpan` pointing to the error location

#### Scenario: Error message is actionable
- **WHEN** a `ParseError` is thrown
- **THEN** the error message SHALL describe what was expected vs what was found (e.g., "Expected ')' after script declaration, found 'identifier'")

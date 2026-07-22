## ADDED Requirements

### Requirement: Parser handles malformed scripts gracefully
The parser SHALL reject malformed Pine Script input with descriptive errors rather than crashing or producing undefined ASTs.

#### Scenario: Empty script
- **WHEN** the parser receives an empty string
- **THEN** it SHALL throw a ParseError with a clear message

#### Scenario: Missing version declaration
- **WHEN** the parser receives a script without `//@version=N`
- **THEN** it SHALL throw a ParseError indicating the version is missing

#### Scenario: Unsupported version
- **WHEN** the parser receives a script with `//@version=4` or `//@version=7`
- **THEN** it SHALL throw a ParseError indicating only v5 and v6 are supported

#### Scenario: Script exceeds maximum size
- **WHEN** the parser receives a script larger than 1MB
- **THEN** it SHALL throw a ParseError about exceeding maximum size

#### Scenario: Deeply nested expressions
- **WHEN** the parser receives a script with extremely nested expressions (e.g., 100+ levels of parenthesized or binary expressions)
- **THEN** it SHALL either parse successfully or throw a stack-safe error, not crash with RangeError

#### Scenario: Unicode and special characters in identifiers
- **WHEN** the parser receives scripts with Unicode, zero-width characters, or control characters
- **THEN** it SHALL reject invalid identifiers with a tokenizer error or parse valid ones correctly

#### Scenario: Mismatched brackets/parens
- **WHEN** the parser receives scripts with unmatched `(`, `[`, or `{`
- **THEN** it SHALL throw a ParseError with location info

#### Scenario: String literal with unterminated quotes
- **WHEN** the parser receives a script with an unterminated string literal
- **THEN** it SHALL throw a ParseError at the expected position

#### Scenario: Division by zero in constant expression
- **WHEN** the parser receives `a = 1/0` as a constant expression
- **THEN** it SHALL produce an AST representing the division (runtime handles the division)

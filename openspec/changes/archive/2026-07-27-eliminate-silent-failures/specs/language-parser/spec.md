## MODIFIED Requirements

### Requirement: Pine Script Parsing
The parser SHALL parse Pine Script v5 and v6 syntax including all language constructs, producing a valid AST for valid code and descriptive error messages for invalid syntax.

#### Scenario: Valid v5 Code Parsing
- **WHEN** valid Pine Script v5 code is provided
- **THEN** the parser SHALL produce a valid AST

#### Scenario: Valid v6 Code Parsing
- **WHEN** valid Pine Script v6 code is provided
- **THEN** the parser SHALL produce a valid AST

#### Scenario: Syntax Error Reporting
- **WHEN** invalid syntax is encountered
- **THEN** the parser SHALL produce descriptive error messages with line/column information

#### Scenario: No Silent Recovery from Malformed Input
- **WHEN** any malformed input is encountered (unmatched delimiters, missing operands, incomplete annotations, unrecognised tokens)
- **THEN** the parser SHALL throw a `ParseError` with source location — it SHALL NOT silently recover by returning a partial AST without error

#### Scenario: AST Completeness
- **WHEN** a valid Pine Script program is parsed
- **THEN** the AST SHALL preserve all semantic information needed for execution

#### Scenario: Named Arguments
- **WHEN** function calls use named arguments (`identifier = expression`)
- **THEN** the parser SHALL parse them as named arguments and include them in the AST

#### Scenario: Namespace Token Identifiers
- **WHEN** member expressions use color, shape, location, strategy, indicator, or library tokens
- **THEN** the parser SHALL support them as valid identifiers in member expressions

#### Scenario: Switch Expressions
- **WHEN** a switch expression with arrow syntax (`=>`) is encountered
- **THEN** the parser SHALL parse it with full v6 semantics including local block scoping and conditional branching

#### Scenario: Type-Inferred Array Declarations
- **WHEN** `array.new_<type>()` syntax is used
- **THEN** the parser SHALL infer `array<elementType>` as the return type

#### Scenario: Compound Assignment Operators
- **WHEN** `+=`, `-=`, `*=`, `/=` are used
- **THEN** the parser SHALL recognize them as compound assignment operators

#### Scenario: Const Keyword
- **WHEN** the `const` keyword precedes a variable declaration
- **THEN** the parser SHALL parse it as a constant variable declaration

#### Scenario: Indentation-Aware Else Binding
- **WHEN** `else` clauses exist at different indentation levels
- **THEN** the parser SHALL bind `else` to the `if` at the same indentation level using column-based matching

## ADDED Requirements

### Requirement: No Partial AST on Unrecoverable Error
The parser SHALL NOT return a partially-parsed AST when it encounters an error from which it cannot recover. If any parse error occurs, the `parse()` function SHALL throw rather than returning an incomplete program.

#### Scenario: Unrecoverable parse error throws
- **WHEN** a parse error occurs during tokenization or parsing
- **THEN** the `parse()` function SHALL throw a `ParseError` rather than returning a malformed `ParseResult`

#### Scenario: No silent error accumulation
- **WHEN** multiple parse errors occur
- **THEN** the parser SHALL throw on the first unrecoverable error (fail-fast) rather than accumulating errors silently

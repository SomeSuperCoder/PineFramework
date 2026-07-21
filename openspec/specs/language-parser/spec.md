## ADDED Requirements

### Requirement: Dynamic Version Detection
The parser SHALL dynamically detect the declared Pine Script version from the `//@version=N` directive (supporting N=5 and N=6), automatically select the corresponding grammar, and apply version-appropriate syntax rules without manual configuration.

#### Scenario: Version 5 Detection
- **WHEN** a script starts with `//@version=5`
- **THEN** the parser SHALL detect version 5 and apply v5 grammar rules

#### Scenario: Version 6 Detection
- **WHEN** a script starts with `//@version=6`
- **THEN** the parser SHALL detect version 6 and apply v6 grammar rules

#### Scenario: No Version Declaration
- **WHEN** a script omits the `//@version` directive
- **THEN** the parser SHALL default to v6 grammar

#### Scenario: Invalid Version
- **WHEN** an unsupported version number is provided
- **THEN** the parser SHALL produce a descriptive error message

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

### Requirement: Compiler Validation
The compiler SHALL validate type consistency, perform scope resolution, and produce a type-checked intermediate representation from the AST.

#### Scenario: Type Checking
- **WHEN** the AST contains type-inconsistent operations
- **THEN** the compiler SHALL detect and report the type errors

#### Scenario: Successful Compilation
- **WHEN** a valid AST is provided
- **THEN** the compiler SHALL produce an executable intermediate representation

#### Scenario: Expression Type Inference
- **WHEN** comparison operators (>, <, >=, <=) are used
- **THEN** the compiler SHALL infer the result type as `bool` instead of `float`

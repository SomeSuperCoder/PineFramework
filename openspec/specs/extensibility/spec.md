## ADDED Requirements

### Requirement: Library Indicator Import
The engine SHALL support import statements for reusable library scripts via `import` keyword.

#### Scenario: Library Import
- **WHEN** an import statement is used to include a library
- **THEN** the engine SHALL resolve and load the library

#### Scenario: Library Function Call
- **WHEN** a function from an imported library is called
- **THEN** the engine SHALL execute it in the library's scope

### Requirement: Custom Library Development
The engine SHALL support library() declaration for creating reusable Pine libraries.

#### Scenario: Library Declaration
- **WHEN** a script uses library() instead of indicator()
- **THEN** the engine SHALL treat it as a reusable library

#### Scenario: Library Export
- **WHEN** functions are defined in a library
- **THEN** they SHALL be exportable via the `export` keyword

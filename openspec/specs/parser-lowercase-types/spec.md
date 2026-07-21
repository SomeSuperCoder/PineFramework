## Purpose
Implement and verify Lowercase Type Keywords functionality for the parser-lowercase-types module.

## Requirements

### Requirement: Lowercase Type Keywords
The parser SHALL accept lowercase type keywords (`int`, `float`, `bool`, `string`, `color`, `line`, `label`, `box`, `table`, `polyline`, `array`, `matrix`, `map`) as valid type declarations.

#### Scenario: Lowercase Types
- **WHEN** `int`, `float`, `bool`, `string`, `color` are used as type annotations
- **THEN** the parser SHALL accept them as valid type keywords

#### Scenario: Lowercase Object Types
- **WHEN** `line`, `label`, `box`, `table`, `polyline` are used as type annotations
- **THEN** the parser SHALL accept them as valid object type declarations

#### Scenario: Lowercase Collection Types
- **WHEN** `array`, `matrix`, `map` are used as type annotations
- **THEN** the parser SHALL accept them as valid collection type declarations

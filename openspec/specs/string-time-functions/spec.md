## Purpose
Implement and verify String Manipulation functionality for the string-time-functions module.

## Requirements

### Requirement: String Manipulation
The engine SHALL implement Pine-compatible string functions: str.contains, str.replace, str.substring, str.length, str.lower, str.upper, str.pos, str.split, str.tonumber, str.format, str.endswith, str.startswith, str.match, str.tostring, char.code_at, char.new, char.compare_strings, and char.eq_strings.

#### Scenario: String Search
- **WHEN** str.contains() or str.pos() is called
- **THEN** the engine SHALL search within the string

#### Scenario: String Transformation
- **WHEN** str.replace(), str.lower(), str.upper(), str.substring() are called
- **THEN** the engine SHALL transform the string accordingly

#### Scenario: String Conversion
- **WHEN** str.tonumber() or str.tostring() is called
- **THEN** the engine SHALL convert between string and number

#### Scenario: String Formatting
- **WHEN** str.format() is called
- **THEN** the engine SHALL format the string using the format pattern

#### Scenario: Character Functions
- **WHEN** char.code_at(), char.new(), char.compare_strings(), char.eq_strings() are called
- **THEN** the engine SHALL return character-level results

### Requirement: Time Manipulation Functions
The engine SHALL implement Pine-compatible time functions for timestamp creation, time component extraction, and datetime arithmetic.

#### Scenario: Timestamp Creation
- **WHEN** timestamp() is called with year, month, day, hour, minute, second
- **THEN** the engine SHALL return a Unix millisecond timestamp

#### Scenario: Time Component Extraction
- **WHEN** year(), month(), weekofyear(), dayofmonth(), dayofweek(), hour(), minute(), second() are called
- **THEN** the engine SHALL extract the respective component from a timestamp

#### Scenario: Time-Based Conditions
- **WHEN** time() or time_close() is used
- **THEN** the engine SHALL return current bar epoch time in milliseconds

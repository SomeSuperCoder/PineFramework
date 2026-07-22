## ADDED Requirements

### Requirement: Series operations handle empty states gracefully
All Series methods SHALL return safe defaults (NA, empty array, or no-op) when the series has no values, rather than throwing or returning undefined.

#### Scenario: push/pop cycle on empty series
- **WHEN** values are pushed then the series is cleared and accessed immediately
- **THEN** `last()` SHALL return NA, `length` SHALL be 0

#### Scenario: slice on empty series returns empty array
- **WHEN** `slice()` is called on an empty series
- **THEN** an empty array SHALL be returned

#### Scenario: clear on already empty series
- **WHEN** `clear()` is called on an empty series
- **THEN** no error SHALL be thrown, length remains 0

#### Scenario: Multiple clear/repopulate cycles
- **WHEN** a series undergoes repeated clear() then push() cycles
- **THEN** all values SHALL be accessible after each cycle

### Requirement: Series handles single-element edge cases
Series with exactly one element SHALL behave correctly for all operations.

#### Scenario: getRelative(0) on single-element series
- **WHEN** `getRelative(0)` is called on a series with exactly one value
- **THEN** that value SHALL be returned

#### Scenario: getRelative(1) on single-element series (beyond length)
- **WHEN** `getRelative(1)` is called on a series with exactly one value
- **THEN** NA SHALL be returned

#### Scenario: last() and lastOrDefault() on single-element
- **WHEN** `last()` and `lastOrDefault(fallback)` are called on a single-element series
- **THEN** both SHALL return the single value

### Requirement: Series handles extreme data volumes
Series operations SHALL handle very large datasets without memory corruption.

#### Scenario: Large number of pushes
- **WHEN** 100,000 values are pushed sequentially
- **THEN** all values SHALL be accessible; length SHALL be 100,000

#### Scenario: getRelative on large series
- **WHEN** `getRelative(99999)` is called on a series with 100,000 values
- **THEN** the oldest (first) value SHALL be returned

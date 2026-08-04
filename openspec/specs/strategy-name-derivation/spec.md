# strategy-name-derivation Specification

## Purpose

Provides a single, shared way to derive a human-readable script name from Pine Script source, extracted from the `strategy()`/`indicator()`/`study()` declaration. Used by the script editor, quick indicator adder, bot setup Review step, and running dashboard so all surfaces show the same derived name instead of raw source text.

## Requirements

### Requirement: Derive script name from declaration

The system SHALL derive a script's display name from its top-level declaration. When the source declares `strategy("Name", ...)`, `indicator("Name", ...)`, or `study("Name", ...)` with a positional first string argument, the system SHALL return that string as the name. When the declaration instead uses a named `title="Name"` argument, the system SHALL return that string. When the source declares no such argument, the system SHALL return `null` so callers can apply their own fallback.

#### Scenario: Positional name in declaration

- **WHEN** source contains `strategy("MA Crossover", overlay=true)`
- **THEN** the derived name is `MA Crossover`

#### Scenario: Named title argument in declaration

- **WHEN** source contains `indicator(title="RSI", shorttitle="RSI")`
- **THEN** the derived name is `RSI`

#### Scenario: No declaration argument present

- **WHEN** source contains no `strategy`/`indicator`/`study` declaration, or one with no name argument
- **THEN** the derived name is `null`

#### Scenario: Single quote names supported

- **WHEN** source contains `strategy('Long Only')`
- **THEN** the derived name is `Long Only`

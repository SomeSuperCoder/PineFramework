## Purpose
Provide a shared universal candle string formatting function that replaces template variables with real candle data values across all layers.

## Requirements

### Requirement: Universal Candle String Formatting
The system SHALL provide a shared `formatCandleString` function that replaces template variables with real candle data values, available across all layers (runtime engine, backend, frontend).

#### Scenario: Basic variable substitution
- **WHEN** `formatCandleString` is called with a template containing `{{ticker}}`, `{{close}}`, and `{{interval}}` and a context with matching values
- **THEN** the function SHALL return the string with each variable replaced by its corresponding value

#### Scenario: All supported variables
- **WHEN** `formatCandleString` is called with a template containing all supported variables (`{{ticker}}`, `{{interval}}`, `{{open}}`, `{{high}}`, `{{low}}`, `{{close}}`, `{{volume}}`, `{{time}}`, `{{bar_index}}`, `{{timestamp}}`)
- **THEN** the function SHALL replace each with the correct value from the context

#### Scenario: Single-curly fallback
- **WHEN** a template uses `{time}`, `{bar_index}`, or `{timestamp}` (single curly braces)
- **THEN** the function SHALL also substitute these as a fallback for backward compatibility

#### Scenario: Missing context field
- **WHEN** a template contains a variable whose field is not present in the context
- **THEN** the function SHALL leave the variable unresolved (as-is)

#### Scenario: No variables in template
- **WHEN** the template contains no template variables
- **THEN** the function SHALL return the template unchanged

### Requirement: Alert System Integration
The alert system SHALL use the shared `formatCandleString` function instead of its own inline formatting logic, and SHALL pass `ticker` when available.

#### Scenario: alertcondition message formatted
- **WHEN** an `alertcondition()` triggers with a message containing `{{ticker}}`
- **THEN** the emitted event SHALL have `{{ticker}}` resolved to the symbol name

#### Scenario: alert() message formatted
- **WHEN** `alert()` is called with a message containing `{{ticker}}`
- **THEN** the emitted event SHALL have `{{ticker}}` resolved to the symbol name

### Requirement: Telegram Alert Resolution
The Telegram notification path SHALL apply `formatCandleString` to alert messages before sending, resolving variables that were not resolved at the runtime layer (e.g., `{{ticker}}` when only available in the backend context).

#### Scenario: Telegram resolves ticker
- **WHEN** a Telegram alert is sent for a symbol with a message containing `{{ticker}}`
- **THEN** the sent message SHALL contain the resolved ticker symbol

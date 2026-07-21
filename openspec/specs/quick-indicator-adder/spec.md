## ADDED Requirements

### Requirement: Quick Indicator Adder
The frontend SHALL provide a keyboard shortcut (Ctrl+K / Cmd+K) to open a fuzzy-search dialog for quickly adding indicators.

#### Scenario: Keyboard Shortcut
- **WHEN** the user presses Ctrl+K
- **THEN** a quick-add dialog SHALL open

#### Scenario: Fuzzy Search
- **WHEN** the user types in the quick-add dialog
- **THEN** it SHALL fuzzy-match available indicator names in real-time

#### Scenario: One-Click Add
- **WHEN** the user selects an indicator from the quick-add results
- **THEN** the indicator SHALL be added to the chart immediately

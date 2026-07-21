## ADDED Requirements

### Requirement: Dynamic Indicator Management UI
The frontend SHALL provide UI for adding, removing, reordering, and configuring indicators without page reload.

#### Scenario: Add Indicator
- **WHEN** the user clicks "Add Indicator"
- **THEN** a dialog SHALL show available scripts with search/filter

#### Scenario: Remove Indicator
- **WHEN** the user clicks remove on an indicator
- **THEN** the indicator SHALL be removed and its pane closed

#### Scenario: Reorder Indicators
- **WHEN** the user drags an indicator in the list
- **THEN** the indicator panes SHALL reorder accordingly

#### Scenario: Settings Dialog
- **WHEN** the user opens indicator settings
- **THEN** a dialog SHALL display the input() parameters as configurable fields

#### Scenario: Search/Filter Available Indicators
- **WHEN** the user types in the "Add Indicator" search field
- **THEN** the list SHALL filter to matching indicators in real-time

#### Scenario: Quick Indicator Adder
- **WHEN** the user presses Ctrl+K or opens the add indicator panel
- **THEN** the quick indicator adder SHALL allow fuzzy-search of all available scripts and add the selected one with a single click

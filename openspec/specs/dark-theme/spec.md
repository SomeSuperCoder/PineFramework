## ADDED Requirements

### Requirement: Dark Theme UI
The application SHALL provide a dark theme for all UI components including chart, editor, and settings panels.

#### Scenario: Default Dark Theme
- **WHEN** the application loads
- **THEN** the UI SHALL render in dark theme by default

#### Scenario: Chart Dark Colors
- **WHEN** rendering chart elements (background, grid, candles)
- **THEN** they SHALL use dark-theme appropriate colors

#### Scenario: Editor Dark Theme
- **WHEN** the code editor is open
- **THEN** it SHALL use a dark color scheme for syntax highlighting

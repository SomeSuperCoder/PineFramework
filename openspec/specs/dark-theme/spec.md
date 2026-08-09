## Purpose
Implement and verify Dark Theme UI functionality for the dark-theme module.

## Requirements

### Requirement: Dark Theme UI
The application SHALL provide a dark theme for all UI components including chart, editor, and settings panels, based on the Miro-dark token palette (dark carbon canvas/surfaces, ink text scales, brand-yellow accent, dark-compatible pastels). The old control-panel dark values SHALL be fully removed; no light theme exists or SHALL be introduced — including through the shadcn component layer (no shadcn light-theme block, no `prefers-color-scheme: light` rules).

#### Scenario: Default Dark Theme
- **WHEN** the application loads
- **THEN** the UI SHALL render in dark theme by default using the Miro-dark canvas token

#### Scenario: Shadcn layer stays dark-only
- **WHEN** the shadcn bridge stylesheet is authoring theme variables
- **THEN** there SHALL be exactly one dark theme block (derived from `--pf-*` tokens)
- **AND** no shadcn `light` theme block, no `prefers-color-scheme: light` media rule, no `dark:`-class toggling SHALL be added

#### Scenario: Chart Dark Colors
- **WHEN** rendering chart elements (background, grid, candles)
- **THEN** they SHALL use the dark chart tokens defined in the design system, consumed from the single token source

#### Scenario: Editor Dark Theme
- **WHEN** the code editor is open
- **THEN** it SHALL use a dark color scheme consistent with the Miro-dark tokens

#### Scenario: No legacy dark values
- **WHEN** a developer searches component source for the old palette values
- **THEN** no legacy dark hex values SHALL be present

#### Scenario: No light theme anywhere
- **WHEN** the application is inspected
- **THEN** there SHALL be no light-theme overrides or `prefers-color-scheme: light` rules in CSS, shadcn bridge, or component code

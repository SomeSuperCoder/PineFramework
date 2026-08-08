## MODIFIED Requirements

### Requirement: Dark Theme UI
The application SHALL provide a dark theme for all UI components including chart, editor, and settings panels, based on the Miro-dark token palette (dark carbon canvas/surfaces, ink text scales, brand-yellow accent, dark-compatible pastels). The old control-panel dark values (`#0d0d18`, `#0f1520`, `#e94560`) SHALL be fully removed; no light theme exists or SHALL be introduced.

#### Scenario: Default Dark Theme
- **WHEN** the application loads
- **THEN** the UI SHALL render in dark theme by default using the Miro-dark canvas token

#### Scenario: Chart Dark Colors
- **WHEN** rendering chart elements (background, grid, candles)
- **THEN** they SHALL use the dark chart tokens defined in the design system, consumed from the single token source

#### Scenario: Editor Dark Theme
- **WHEN** the code editor is open
- **THEN** it SHALL use a dark color scheme consistent with the Miro-dark tokens

#### Scenario: No legacy dark values
- **WHEN** a developer searches component source for the old palette values
- **THEN** no legacy dark hex (`#0d0d18`, `#0f1520`, `#e94560`) SHALL be present

#### Scenario: No light theme
- **WHEN** the application theme is inspected
- **THEN** there SHALL be no light-theme overrides or `prefers-color-scheme: light` rules

## REMOVED Requirements

### Requirement: Old control-panel dark palette
**Reason:** Director mandate — all trace of the old design system removed; the Miro-dark token palette replaces the values.
**Migration**: Legacy values map to the new tokens via the legacy-mapping table in `DESIGN-MIRO-DARK.md`.
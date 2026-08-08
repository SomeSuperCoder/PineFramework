## MODIFIED Requirements

### Requirement: React Frontend Application
The frontend SHALL provide a React-based Single Page Application with routing, tab management, and integration with the backend for script execution and charting. All visual styling SHALL resolve from the single Miro-dark token source and the shared primitive component layer; components SHALL NOT hardcode legacy design hex values.

#### Scenario: SPA Routing
- **WHEN** the user navigates between views
- **THEN** the SPA SHALL route without full page reloads

#### Scenario: Tab Management
- **WHEN** the user opens multiple scripts/charts
- **THEN** the application SHALL manage them as separate tabs

#### Scenario: Backend Integration
- **WHEN** the user opens a script
- **THEN** the frontend SHALL request execution via the backend WebSocket API

#### Scenario: Styling resolves from tokens
- **WHEN** any component (shell, panel, table, popup, button) renders
- **THEN** its colors, radii, spacing, and shadows SHALL resolve from `theme/tokens.ts` or CSS variables mirrored from it
- **AND** it SHALL NOT contain hardcoded values from the removed control-panel palette

#### Scenario: Reusable primitives in use
- **WHEN** a UI element belongs to a primitive category (Button, Card, Input, Modal/Surface, Tab, NumberInput, ProgressBar)
- **THEN** it SHALL use the project's shared primitive component consuming tokens
- **AND** the ad-hoc per-component style-const duplication SHALL be absent

## REMOVED Requirements

### Requirement: Old inline-style design approach
**Reason**: The old system's per-component inline `const styles: Record<string, React.CSSProperties>` records with hardcoded legacy hex are replaced by token-driven primitives.
**Migration**: Inline style records are converted via the legacy-mapping codemod to token references; primitives absorb them where a primitive category exists.
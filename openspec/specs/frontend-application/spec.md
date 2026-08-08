## Purpose
Implement and verify React Frontend Application functionality for the frontend-application module.

## Requirements

### Requirement: Backtest Panel SHALL Select Strategy via Dropdown
The backtest panel SHALL let the user choose which strategy to backtest through a strategy dropdown populated from the strategies API (user scripts + built-ins). The selected strategy's Pine source SHALL be sent as the `script` field of the backtest request. The backtest flow SHALL NOT depend on the chart as the strategy source.

#### Scenario: User selects a strategy and runs backtest
- **WHEN** a user chooses a strategy from the panel's dropdown and clicks run
- **THEN** the backtest request SHALL include the chosen strategy's Pine source as `script`
- **AND** the panel SHALL run the backtest for that strategy regardless of chart state

#### Scenario: Backtest blocked without strategy selection
- **WHEN** a user attempts to run a backtest without a strategy selected
- **THEN** the panel SHALL block the submission
- **AND** SHALL surface a visible message telling the user to select a strategy

### Requirement: Backtest Panel SHALL Show Strategy List States
The backtest panel strategy dropdown SHALL communicate loading, empty, and selection states so the user understands the strategy list status.

#### Scenario: Strategy list loading
- **WHEN** the strategy list is loading
- **THEN** the dropdown SHALL indicate a loading state

#### Scenario: No strategies available
- **WHEN** the strategy list is empty
- **THEN** the dropdown SHALL indicate no strategies are available

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

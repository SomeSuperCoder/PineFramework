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
The frontend SHALL provide a React-based Single Page Application with routing, tab management, and integration with the backend for script execution and charting. All visual styling SHALL resolve from the single Miro-dark token source; components SHALL render through the shadcn component layer (Radix-backed) where a shadcn primitive exists, and SHALL NOT hardcode legacy design hex values.

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
- **WHEN** any component (shell, panel, table, popup, button, chart wrapper) renders
- **THEN** its colors, radii, spacing, and shadows SHALL resolve from `theme/tokens.ts` or the CSS variables mirrored from it
- **AND** it SHALL NOT contain hardcoded values from the removed control-panel palette

#### Scenario: Primitives come from the shadcn layer
- **WHEN** a UI element belongs to a primitive category covered by the shadcn layer (Button, Badge, Card, Input, Textarea, Label, Select, Tabs, Dialog, AlertDialog, Popover, Command, DropdownMenu, Switch, Tooltip, Skeleton, Alert, Progress, Table)
- **THEN** it SHALL render through the shadcn component (possibly wrapped by a thin recipe layer)
- **AND** ad-hoc per-component style-const duplication (inline `style={{...tokens}}`) SHALL be absent for those categories

### Requirement: Chart wrapper contracts remain stable
The chart wrapper components (`ChartComponent`, `MiniChart`, and the StatisticsTab canvas components) SHALL keep their props contracts, keep rendering a real `<canvas>` node (e2e canvas-count assertions stay valid), and keep exposing the `window.__pineChart` / `__pineFetchOlder` debug bridge. Only their surrounding chrome (toolbars, pills, legends) may be converted to the shadcn layer; the chart engine internals (`frontend/src/chart/**`) SHALL NOT be reworked.

#### Scenario: Canvas and bridge survive conversion
- **WHEN** the frontend has been converted to shadcn and an e2e/unit assertion counts `canvas` nodes or calls `window.__pineChart`
- **THEN** the canvas node count and the bridge behavior SHALL be unchanged from the pre-conversion baseline

#### Scenario: Panel keyboard routing survives
- **WHEN** the user presses keys 1–5 in the application chrome
- **THEN** the corresponding panel SHALL activate (ControlPanel route switching) — the shadcn conversion SHALL NOT break the app-level 1–5 routing

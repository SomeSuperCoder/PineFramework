## Purpose
Implement and verify React Frontend Application functionality for the frontend-application module.

## MODIFIED Requirements

### Requirement: React Frontend Application
The frontend SHALL provide a React-based Single Page Application with routing, tab management, integration with the backend for script execution and charting, and a live trading bot control panel in the bottom panel.

#### Scenario: SPA Routing
- **WHEN** the user navigates between views
- **THEN** the SPA SHALL route without full page reloads

#### Scenario: Tab Management
- **WHEN** the user opens multiple scripts/charts
- **THEN** the application SHALL manage them as separate tabs

#### Scenario: Backend Integration
- **WHEN** the user opens a script
- **THEN** the frontend SHALL request execution via the backend WebSocket API

#### Scenario: Bot Start Control [ADDED]
- **WHEN** the user clicks Start Bot in the bottom panel
- **THEN** the frontend SHALL send a start command to the backend trading engine

#### Scenario: Bot Stop Control [ADDED]
- **WHEN** the user clicks Stop Bot in the bottom panel
- **THEN** the frontend SHALL send a stop command to the backend trading engine

#### Scenario: Bot Dashboard [ADDED]
- **WHEN** the user opens the Dashboard view
- **THEN** the frontend SHALL display live status, metrics, positions, and streaming logs via WebSocket

#### Scenario: Frontend reflects backend state [ADDED]
- **WHEN** the frontend displays bot status
- **THEN** it SHALL always reflect the actual backend state rather than assuming commands succeeded

#### Scenario: Frontend does not block trading [ADDED]
- **WHEN** the user closes the frontend UI
- **THEN** the backend trading engine SHALL continue running unaffected

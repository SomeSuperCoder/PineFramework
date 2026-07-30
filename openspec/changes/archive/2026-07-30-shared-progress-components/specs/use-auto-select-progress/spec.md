## ADDED Requirements

### Requirement: useAutoSelectProgress hook manages auto-select state
The system SHALL provide a `useAutoSelectProgress` hook that encapsulates WebSocket-based auto-select progress state management.

#### Scenario: Hook returns progress state
- **WHEN** `useAutoSelectProgress(backendUrl)` is called
- **THEN** the hook SHALL return `{ autoSelectProgress, autoSelectResult, reset }`

#### Scenario: Progress updates from WebSocket
- **WHEN** a `bot:autoSelect` progress message is received via WebSocket
- **THEN** `autoSelectProgress` SHALL be updated with the new status map

#### Scenario: Complete event updates result
- **WHEN** a `bot:autoSelect` complete message is received via WebSocket
- **THEN** `autoSelectResult` SHALL be populated with ranking data and `autoSelectProgress` SHALL be null

#### Scenario: Reset clears state
- **WHEN** `reset()` is called
- **THEN** both `autoSelectProgress` and `autoSelectResult` SHALL be cleared

#### Scenario: Bot state change resets progress
- **WHEN** the bot state changes to `Running` or `Starting`
- **THEN** `autoSelectProgress` SHALL be cleared (backtests running during start, not preview)

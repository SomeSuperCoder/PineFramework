## ADDED Requirements

### Requirement: Line extend property propagation

Script execution results SHALL preserve the `extend` property of drawing lines through the entire frontend data pipeline from API response to canvas renderer.

#### Scenario: Initial execution includes extend on all lines

- **WHEN** an indicator script creates lines with various `extend` values (e.g., `extend.right`, `extend.none`)
- **THEN** the `ScriptResult` produced by `buildScriptResult()` SHALL include the `extend` value for each line, matching the value set by the Pine Script execution engine

#### Scenario: Real-time diff preserves extend

- **WHEN** a real-time WebSocket update delivers new lines via `mergeDiffIntoResult()`
- **THEN** the merged `ScriptResult` SHALL carry the `extend` property on each diff line, matching the value from the WebSocket message

#### Scenario: Default extend is 'none'

- **WHEN** a line object has no `extend` property (legacy data or missing field)
- **THEN** the line SHALL render with `extend` defaulting to `'none'` (finite segment behavior)

### Requirement: ExecuteResponse interface completeness

The `ExecuteResponse` TypeScript interface in `useChartData.ts` SHALL declare the `extend` field on its line type.

#### Scenario: Interface accepts extend values

- **WHEN** the API returns a line with `extend: "right"` in the response JSON
- **THEN** TypeScript SHALL accept the field without type errors in `buildScriptResult()` usage

## Purpose
Implement and verify Scroll Re-Execution functionality for the scroll-re-execution module.

## Requirements

### Requirement: Scroll Re-Execution
When scrolling the chart to a new visible range, the engine SHALL re-execute indicators for the visible bars.

#### Scenario: Scroll Recompute
- **WHEN** the user scrolls to a new bar range
- **THEN** the engine SHALL re-execute for the visible bars

#### Scenario: Cached Regions
- **WHEN** scrolling to a previously computed region
- **THEN** the engine SHALL use cached results instead of re-executing

### Requirement: Context bars limited by available history
The system SHALL tolerate cases where the requested context size exceeds the available historical bar count, and SHALL not produce rendering gaps as a result.

#### Scenario: Insufficient context bars produce warmup nulls
- **WHEN** `fetchOlderOHLCV` requests `contextSize` bars (e.g., 1000)
- **AND** only `actualContextSize < contextSize` bars are available (e.g., 300)
- **AND** the indicator has `maxLookback > actualContextSize`
- **THEN** the re-execution SHALL proceed with the available context bars
- **AND** the merged result SHALL preserve previous values for positions where the re-execution produced warmup nulls

## ADDED Requirements

### Requirement: Context bars limited by available history

The system SHALL tolerate cases where the requested context size exceeds the available historical bar count, and SHALL not produce rendering gaps as a result.

#### Scenario: Insufficient context bars produce warmup nulls
- **WHEN** `fetchOlderOHLCV` requests `contextSize` bars (e.g., 1000)
- **AND** only `actualContextSize < contextSize` bars are available (e.g., 300)
- **AND** the indicator has `maxLookback > actualContextSize`
- **THEN** the re-execution SHALL proceed with the available context bars
- **AND** the merged result SHALL preserve previous values for positions where the re-execution produced warmup nulls

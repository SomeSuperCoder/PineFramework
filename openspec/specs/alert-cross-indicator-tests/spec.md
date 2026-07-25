## Purpose
Verify alert trigger index alignment, metadata preservation, and visual consistency across multi-condition indicators.

## Requirements

### Requirement: Alert triggers have valid barIndex for multi-condition indicators
The system SHALL produce `AlertTriggerEntry[]` with barIndex values that are 0-based and strictly within `[0, bars.length)` for any indicator with multiple `alertcondition()` calls.

#### Scenario: HHLL 9-condition indicator on sine-wave data
- **WHEN** `higher-high-lower-low.pine` (9 alertcondition() calls) is executed on 1000 sine-wave bars
- **THEN** all trigger barIndex values SHALL be in `[0, 1000)` with matching timestamps

#### Scenario: Volatility trail 4-condition indicator on linear data
- **WHEN** `volatility-trail.pine` (4 alertcondition() calls) is executed on 500 linear-up bars
- **THEN** all trigger barIndex values SHALL be in `[0, 500)` with matching timestamps

### Requirement: Alert conditions metadata is preserved
The system SHALL produce `AlertConditionEntry[]` containing title and message for each unique alertcondition() call.

#### Scenario: HHLL condition count
- **WHEN** `higher-high-lower-low.pine` is executed
- **THEN** `alertConditions` SHALL contain 9 entries with non-empty title and message

#### Scenario: Volatility trail condition count
- **WHEN** `volatility-trail.pine` is executed
- **THEN** `alertConditions` SHALL contain 4 entries with non-empty title and message

### Requirement: Alert triggers survive prepend merge
When older bars are prepended and the script re-executed, merged alert trigger positions SHALL remain valid.

#### Scenario: HHLL triggers valid after prepend
- **WHEN** `higher-high-lower-low.pine` is executed on 500 bars, then 200 older bars are prepended and merged
- **THEN** all merged trigger barIndex values SHALL be in `[0, 700)` with original first bar trigger at `barIndex == 200`

### Requirement: Visual markers and alert triggers are consistent
Every bar with a visual marker SHALL also have a corresponding alert trigger, and vice versa.

#### Scenario: Volatility trail flips match labels
- **WHEN** `volatility-trail.pine` is executed
- **THEN** every bar with a "▲" or "▼" label SHALL also have a corresponding flipUp/flipDn alert trigger

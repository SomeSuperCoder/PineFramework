## ADDED Requirements

### Requirement: Alert triggers have valid barIndex for multi-condition indicators
The system SHALL produce `AlertTriggerEntry[]` with barIndex values that are 0-based and strictly within `[0, bars.length)` for any indicator with multiple `alertcondition()` calls, including those using stateful `var` variables.

#### Scenario: HHLL 9-condition indicator on sine-wave data
- **WHEN** `higher-high-lower-low.pine` (9 `alertcondition()` calls) is executed on 1000 sine-wave bars
- **THEN** all trigger barIndex values SHALL be in `[0, 1000)`
- **THEN** each trigger's timestamp SHALL match the corresponding bar's timestamp

#### Scenario: Volatility trail 4-condition indicator on linear data
- **WHEN** `volatility-trail.pine` (4 `alertcondition()` calls) is executed on 500 linear-up bars
- **THEN** all trigger barIndex values SHALL be in `[0, 500)`
- **THEN** each trigger's timestamp SHALL match the corresponding bar's timestamp

### Requirement: Alert conditions metadata is preserved
The system SHALL produce `AlertConditionEntry[]` containing title and message for each unique `alertcondition()` call in the script.

#### Scenario: HHLL condition count
- **WHEN** `higher-high-lower-low.pine` is executed
- **THEN** `alertConditions` SHALL contain 9 entries
- **THEN** each entry SHALL have a non-empty `title` and `message`

#### Scenario: Volatility trail condition count
- **WHEN** `volatility-trail.pine` is executed
- **THEN** `alertConditions` SHALL contain 4 entries
- **THEN** each entry SHALL have a non-empty `title` and `message`

### Requirement: Alert triggers survive prepend merge
When older bars are prepended to the dataset and the script is re-executed, the merged alert trigger positions SHALL remain valid.

#### Scenario: HHLL triggers valid after prepend
- **WHEN** `higher-high-lower-low.pine` is executed on 500 bars, then 200 older bars are prepended and re-executed, then results are merged via `prependIndicatorResult`
- **THEN** all merged trigger barIndex values SHALL be in `[0, 700)`
- **THEN** the original first bar's trigger SHALL have `barIndex == 200`

#### Scenario: Volatility trail triggers valid after prepend
- **WHEN** `volatility-trail.pine` is executed on 500 bars, then 200 older bars are prepended and re-executed, then results are merged via `prependIndicatorResult`
- **THEN** all merged trigger barIndex values SHALL be in `[0, 700)`
- **THEN** each trigger's timestamp SHALL match the bar at its shifted barIndex

### Requirement: Visual markers and alert triggers are consistent
For indicators that draw both visual markers (labels, shapes) and fire alerts, every bar with a visual marker SHALL also have a corresponding alert trigger, and vice versa for the relevant condition.

#### Scenario: Volatility trail flips match labels
- **WHEN** `volatility-trail.pine` is executed
- **THEN** every bar with a "▲" or "▼" label SHALL also have a `flipUp` or `flipDn` alert trigger
- **THEN** every bar with a `flipUp` or `flipDn` trigger SHALL also have a corresponding label

#### Scenario: Volatility trail retests match shape characters
- **WHEN** `volatility-trail.pine` is executed
- **THEN** every bar with a "◆" character shape SHALL also have a `bullRTok` or `bearRTok` alert trigger
- **THEN** every bar with a `bullRTok` or `bearRTok` trigger SHALL also have a corresponding "◆" shape

### Requirement: Alert triggers are not lost in forming-candle diff merge
When a forming candle produces diff alert triggers, `mergeDiffIntoResult` SHALL append them to the existing triggers without duplication.

#### Scenario: Diff merge preserves existing triggers
- **WHEN** a `ScriptResult` with existing `alertTriggers` is merged with a diff message containing new trigger(s)
- **THEN** the merged result SHALL contain all original triggers plus the new ones
- **THEN** duplicate triggers (same alertId on same bar) SHALL NOT be introduced

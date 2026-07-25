## MODIFIED Requirements

### Requirement: Bar-by-Bar Execution
The execution engine SHALL execute Pine Script programs bar-by-bar, maintaining series state across historical bars and updating calculations on realtime bars, with lookback-aware gating.

#### Scenario: Historical Bar Processing
- **WHEN** processing historical bars
- **THEN** the engine SHALL execute bar-by-bar from oldest to newest while maintaining series state

#### Scenario: Realtime Bar Updates
- **WHEN** realtime bars arrive
- **THEN** the engine SHALL update calculations for the new bar

#### Scenario: Error Rollback
- **WHEN** execution errors occur during realtime processing
- **THEN** the engine SHALL roll back to the previous valid state

#### Scenario: Script Re-Execution
- **WHEN** a new bar opens
- **THEN** the engine SHALL support re-execution on each new bar

#### Scenario: Variable Scope
- **WHEN** executing across bars
- **THEN** the engine SHALL maintain variable scope across script execution

#### Scenario: Series Indexing
- **WHEN** series indexing (e.g., `close[1]`) is used
- **THEN** the engine SHALL access previous bar values from the accumulated history

#### Scenario: For-Loop Inclusive Iteration
- **WHEN** a `for i = 0 to end` loop is used
- **THEN** the engine SHALL include the `end` value in iteration

#### Scenario: Lookback Gating
- **WHEN** executing on a historical bar
- **THEN** the engine SHALL check if `bar_index >= max_bars_back`
- **AND** if lookback is unsatisfied, the engine SHALL skip execution for that bar

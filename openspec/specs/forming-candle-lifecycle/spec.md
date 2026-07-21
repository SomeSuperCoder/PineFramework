## ADDED Requirements

### Requirement: Forming Candle Lifecycle
The engine SHALL support a forming (live) candle lifecycle where the bar is re-evaluated as new ticks arrive within the same bar period.

#### Scenario: Forming Candle Re-Evaluation
- **WHEN** a new tick arrives for the current forming candle
- **THEN** the engine SHALL re-evaluate only the forming bar

#### Scenario: Bar Confirmation
- **WHEN** the bar period closes (barstate.isconfirmed)
- **THEN** the forming bar SHALL finalize and a new forming candle SHALL begin

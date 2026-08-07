## ADDED Requirements

### Requirement: Risk gate enforced on live entries
The system SHALL call `RiskManager.canEnterPosition()` before every live buy execution (both chaos and strategy-driven paths), so the daily loss limit, rolling loss guard, wallet-balance guard, and emergency-stop flag actually prevent new entries when breached. The risk manager SHALL be effective, not record-only.

#### Scenario: Daily loss breach blocks new entries
- **WHEN** `canEnterPosition()` returns `false` due to a breached daily loss limit
- **THEN** no new buy order SHALL be submitted through the execution path

#### Scenario: Clear risk allows entries
- **WHEN** `canEnterPosition()` returns `true`
- **THEN** buy orders SHALL proceed through quote and swap execution normally

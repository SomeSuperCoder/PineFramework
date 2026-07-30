## MODIFIED Requirements

### Requirement: Display USDC balance after wallet import
The frontend SHALL display the USDC balance fetched during import preview on subsequent steps.

#### Scenario: Balance persists to config step
- **WHEN** a wallet is imported with a valid USDC balance
- **THEN** the config step shows the same balance (not $0)

### Requirement: Auto-calculate max daily loss from USDC balance
The system SHALL auto-calculate maxDailyLoss but allow manual override.

#### Scenario: Auto-calculated value shown by default
- **WHEN** the config panel loads
- **THEN** maxDailyLoss is auto-calculated as `min($1, 10% × USDC balance)`
- **AND** a toggle is available to enable manual override

#### Scenario: Manual override enabled
- **WHEN** user toggles manual override on
- **THEN** an input field appears to set custom maxDailyLoss
- **AND** the auto-calculated value is shown as reference

#### Scenario: Manual override disabled
- **WHEN** user toggles manual override off
- **THEN** maxDailyLoss reverts to auto-calculated value

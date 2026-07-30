## ADDED Requirements

### Requirement: Auto-calculate max daily loss from USDC balance
The system SHALL calculate maxDailyLoss as `min($1, USDC balance × 0.10)`.

#### Scenario: Wallet with $50 USDC
- **WHEN** the wallet has $50 USDC balance
- **THEN** maxDailyLoss is calculated as min($1, $50 × 0.10) = $1.00

#### Scenario: Wallet with $5 USDC
- **WHEN** the wallet has $5 USDC balance
- **THEN** maxDailyLoss is calculated as min($1, $5 × 0.10) = $0.50

#### Scenario: Wallet with $0 USDC
- **WHEN** the wallet has $0 USDC balance
- **THEN** maxDailyLoss is 0 (trading disabled)

#### Scenario: Wallet with $1000 USDC
- **WHEN** the wallet has $1000 USDC balance
- **THEN** maxDailyLoss is capped at $1.00

### Requirement: Display calculated risk in config panel
The system SHALL show the auto-calculated maxDailyLoss in the config panel.

#### Scenario: Risk displayed after balance load
- **WHEN** the USDC balance is fetched
- **THEN** the config panel shows "Max Daily Loss: $X.XX"

#### Scenario: Risk updates when balance changes
- **WHEN** the balance changes (e.g., re-import)
- **THEN** the displayed risk updates accordingly

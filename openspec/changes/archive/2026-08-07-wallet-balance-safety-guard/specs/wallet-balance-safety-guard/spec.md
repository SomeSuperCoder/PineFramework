## Purpose

Provides a max-daily-loss safety guard whose source of truth is the actual wallet USDC balance rather than PnL calculations, so an emergency stop still triggers when real losses occur even if PnL accounting is wrong.

## ADDED Requirements

### Requirement: Balance-based max daily loss configuration
The system SHALL support a `risk.maxDailyWalletLossUsdc` configuration value, expressed in whole USDC, where `0` means unlimited. It SHALL be validated as a non-negative number.

#### Scenario: Valid positive threshold
- **WHEN** `risk.maxDailyWalletLossUsdc` is set to a positive number (e.g. `50`)
- **THEN** the configuration is accepted and the guard enforces a 50 USDC maximum daily loss against the wallet balance

#### Scenario: Zero means unlimited
- **WHEN** `risk.maxDailyWalletLossUsdc` is `0`
- **THEN** the guard is disabled and never triggers a breach

#### Scenario: Negative threshold rejected
- **WHEN** `risk.maxDailyWalletLossUsdc` is negative
- **THEN** the configuration is rejected as invalid

### Requirement: Daily reference balance capture
The guard SHALL capture a reference wallet USDC balance at the start of each trading day, using the same timezone-aware trading-day boundary as the daily stop-loss guard. When a new trading day begins, the reference SHALL be re-captured from the current wallet balance.

#### Scenario: Reference captured at first evaluation of the day
- **WHEN** the guard is first evaluated on a new trading day with no reference yet
- **THEN** it SHALL record the current wallet balance as the day's reference

#### Scenario: Reference re-captured on a new day
- **WHEN** a later evaluation occurs on a new trading day (midnight in the configured timezone passed)
- **THEN** the guard SHALL reset and capture the current wallet balance as the new day's reference

### Requirement: Monotonic high-water-mark reference
The reference balance SHALL only ever rise, never fall. A wallet balance increase SHALL raise the reference to the new higher balance. Only drops below the reference SHALL count toward loss.

#### Scenario: Balance increase raises the reference
- **WHEN** the observed wallet balance is higher than the current reference
- **THEN** the reference SHALL be updated to the higher balance and no loss is recorded

#### Scenario: Drop below reference counts as loss
- **WHEN** the observed wallet balance is lower than the reference
- **THEN** the loss SHALL be the difference between the reference and the observed balance

### Requirement: Breach detection and emergency stop
When the loss relative to the reference reaches or exceeds `maxDailyWalletLossUsdc`, the guard SHALL report a breach. A breach SHALL block new position entries and SHALL trigger a full emergency stop of the bot.

#### Scenario: Loss reaches threshold
- **WHEN** the observed balance has dropped by at least `maxDailyWalletLossUsdc` from the reference
- **THEN** the guard SHALL report a breach and the bot SHALL perform an emergency stop

#### Scenario: Loss below threshold allows trading
- **WHEN** the observed balance drop is below `maxDailyWalletLossUsdc`
- **THEN** the guard SHALL NOT report a breach and trading continues normally

### Requirement: Fail-safe on balance fetch failure
If the wallet balance cannot be obtained (RPC error, adapter failure, unavailable source), the guard SHALL log the failure and skip evaluation. A fetch failure SHALL NOT trigger a breach and SHALL NOT mask an already-armed emergency stop.

#### Scenario: Balance fetch error
- **WHEN** the balance source fails or returns an unusable result
- **THEN** the guard SHALL log the failure, skip the evaluation, and not trigger a breach

#### Scenario: Already-breached state persists across fetch failures
- **WHEN** a breach was previously detected and a subsequent balance fetch fails
- **THEN** the bot SHALL remain in the stopped state and the failure SHALL NOT re-enable trading

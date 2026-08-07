## Purpose

Wires the risk-management system into the live trading path so realized PnL and wallet-balance safety guards actually enforce their limits at runtime, triggering an emergency stop on breach.

## ADDED Requirements

### Requirement: RiskManager instantiated in production
The bot bootstrap SHALL construct the risk manager with the configured risk settings — including the PnL daily-stop-loss guard and the wallet-balance guard — and provide it to the bot engine and live executor.

#### Scenario: Bot starts with risk manager
- **WHEN** the bot is started in production
- **THEN** a risk manager SHALL be constructed from the loaded risk configuration and used by the engine

#### Scenario: Risk manager absent degrades gracefully
- **WHEN** no risk configuration is provided
- **THEN** the bot SHALL still start, with risk guards disabled rather than crashing

### Requirement: Realized PnL fed to the daily-loss guard
The live executor SHALL feed realized PnL into the risk manager after each completed trade, so the PnL-based daily-stop-loss guard tracks real losses.

#### Scenario: Trade closes with loss
- **WHEN** a trade closes with a realized loss
- **THEN** the loss SHALL be recorded with the daily-stop-loss guard and the rolling guard

#### Scenario: Trade closes with profit
- **WHEN** a trade closes with a realized profit
- **THEN** the profit SHALL be recorded without counting toward the daily-loss accumulation

### Requirement: Wallet balance snapshots fed to the balance guard
The live path SHALL capture the wallet USDC balance after each completed trade and once per candle, feeding each snapshot to the wallet-balance guard. Fetch failures SHALL be logged and skipped without blocking trading.

#### Scenario: Balance captured after trade
- **WHEN** a trade completes
- **THEN** the wallet USDC balance SHALL be captured and fed to the wallet-balance guard

#### Scenario: Balance captured per candle
- **WHEN** a candle closes while the bot is running
- **THEN** the wallet USDC balance SHALL be captured and fed to the wallet-balance guard

#### Scenario: Balance capture failure does not block trading
- **WHEN** the balance capture fails
- **THEN** the failure SHALL be logged, the evaluation skipped, and trading SHALL continue

### Requirement: Breach events trigger emergency stop
The bot engine SHALL handle both the PnL daily-loss breach and the wallet-balance breach events by notifying and performing an emergency stop, mirroring the existing rolling-loss handling.

#### Scenario: Daily PnL loss breached
- **WHEN** the PnL daily-stop-loss guard reports a breach
- **THEN** the engine SHALL notify via Telegram and perform an emergency stop

#### Scenario: Wallet balance breached
- **WHEN** the wallet-balance guard reports a breach
- **THEN** the engine SHALL notify via Telegram and perform an emergency stop

#### Scenario: Emergency stop halts strategy execution
- **WHEN** an emergency stop is triggered by a breach
- **THEN** the bot SHALL transition to the stopped state and cease strategy execution, consistent with the existing emergency-stop behavior

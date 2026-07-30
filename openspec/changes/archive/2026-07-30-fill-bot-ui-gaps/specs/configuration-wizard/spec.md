## ADDED Requirements

### Requirement: Step-by-Step Configuration Wizard
The setup tab SHALL present configuration as a three-step wizard instead of a flat form.

#### Scenario: Three steps
- **WHEN** the user opens the Setup tab with bot in Idle/Stopped state
- **THEN** the wizard SHALL display three steps with step indicators: 1. Wallet, 2. Config, 3. Review & Start

#### Scenario: Step 1 — Wallet
- **WHEN** the user is on Step 1 (Wallet)
- **THEN** they SHALL see the WalletImportPanel
- **AND** the "Next" button SHALL be disabled until a wallet is imported

#### Scenario: Step 2 — Config
- **WHEN** the user proceeds to Step 2 (Config)
- **THEN** they SHALL see the BotConfigPanel with strategy source, DEX, pairs (per-timeframe), risk settings, and auto-select
- **AND** the "Next" button SHALL be disabled until strategy source is non-empty and at least one pair is entered

#### Scenario: Step 3 — Review & Start
- **WHEN** the user proceeds to Step 3 (Review & Start)
- **THEN** they SHALL see a summary of all settings: wallet public key, strategy name (truncated), DEX, pairs with timeframes, risk limits, auto-select status
- **AND** a prominent "Start Bot" button
- **AND** a "Back" button to return to Step 2

#### Scenario: Back navigation
- **WHEN** the user clicks "Back" on any step
- **THEN** the wizard SHALL return to the previous step
- **AND** preserve all previously entered values

#### Scenario: Auto-select replaces review with progress
- **WHEN** the user clicks Start Bot with auto-select enabled
- **THEN** the Review step SHALL transition to show auto-select progress
- **AND** after auto-select completes, the bot SHALL start automatically (no additional click)

#### Scenario: Wizard not shown when bot is running
- **WHEN** the bot is in Running state
- **THEN** the dashboard tab header SHALL show Status/Metrics/Logs (not Setup/Wizard)

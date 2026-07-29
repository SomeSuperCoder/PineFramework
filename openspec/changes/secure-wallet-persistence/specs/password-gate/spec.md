## ADDED Requirements

### Requirement: Password gate on bot dashboard
The system SHALL require wallet unlock before allowing live trading operations.

#### Scenario: Locked state on startup
- **WHEN** the backend starts and `data/wallet.enc` exists
- **THEN** the bot status is `locked` and the frontend shows an unlock screen

#### Scenario: Unlock with correct password
- **WHEN** user enters the correct password on the unlock screen
- **THEN** the system decrypts the wallet, bot status changes to `idle`, and the full dashboard is displayed

#### Scenario: Unlock with wrong password
- **WHEN** user enters an incorrect password
- **THEN** the system returns an error message and the wallet remains locked

### Requirement: Rate limiting on unlock attempts
The system SHALL limit unlock attempts to prevent brute-force attacks.

#### Scenario: Too many failed attempts
- **WHEN** user fails to unlock 5 times within 1 minute
- **THEN** the system returns a rate-limit error and prevents further attempts for 60 seconds

### Requirement: Bot data accessible without wallet
The system SHALL allow access to bot logs, metrics, and settings without an unlocked wallet.

#### Scenario: View logs while locked
- **WHEN** the wallet is locked
- **THEN** the user can still view bot logs and metrics in the dashboard
- **AND** trading controls are disabled or hidden

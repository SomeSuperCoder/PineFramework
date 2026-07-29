## MODIFIED Requirements

### Requirement: Import wallet from seed phrase
The system SHALL accept a BIP-39 seed phrase and encrypt it with a user-provided password before persisting to disk.

#### Scenario: Import with password
- **WHEN** user submits a valid BIP-39 seed phrase and a password via the wallet import panel
- **THEN** the system encrypts the seed phrase with the provided password using AES-256-GCM
- **AND** writes the encrypted data to `data/wallet.enc`
- **AND** returns success with the wallet address

#### Scenario: Import without password
- **WHEN** user submits a seed phrase without a password
- **THEN** the system returns an error — password is required for persistence

#### Scenario: Re-import overwrites existing wallet
- **WHEN** user imports a new seed phrase while a wallet already exists
- **THEN** the system prompts for confirmation
- **AND** on confirmation, replaces the existing encrypted file with the new one

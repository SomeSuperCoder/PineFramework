## Purpose
Implement secure Solana wallet management for live trading — seed phrase import, encrypted at-rest storage, memory lifecycle, and safe replacement.

## ADDED Requirements

### Requirement: Wallet Import via Seed Phrase
The system SHALL allow the user to securely import a Solana wallet using its BIP39 seed phrase.

#### Scenario: Import with valid seed phrase
- **WHEN** the user provides a valid 12 or 24-word BIP39 seed phrase
- **THEN** the system SHALL derive the Solana keypair and store it encrypted

#### Scenario: Import with invalid seed phrase
- **WHEN** the user provides an invalid seed phrase
- **THEN** the system SHALL reject the import with an error message

### Requirement: Encrypted Storage
The wallet seed phrase and private key SHALL be encrypted at rest using AES-256-GCM.

#### Scenario: Encrypt on import
- **WHEN** a wallet is imported
- **THEN** the system SHALL encrypt the seed phrase before writing to disk

#### Scenario: Decrypt on use
- **WHEN** the trading engine needs to sign a transaction
- **THEN** the system SHALL decrypt the wallet into memory, use it, and wipe it

### Requirement: Never Log Wallet Secrets
Wallet seed phrases, private keys, and derived public keys SHALL never be written to logs, error messages, or debug output.

#### Scenario: Log exclusion
- **WHEN** any log entry is written
- **THEN** it SHALL NOT contain seed phrase words, private key bytes, or raw public key material

#### Scenario: Error message safety
- **WHEN** a wallet operation fails
- **THEN** the error message SHALL NOT include the seed phrase or private key

### Requirement: Memory Wiping
Wallet secrets SHALL be wiped from memory as soon as they are no longer needed.

#### Scenario: Wipe after signing
- **WHEN** a transaction has been signed
- **THEN** the seed phrase and private key SHALL be explicitly zeroed in memory

#### Scenario: Wipe on bot stop
- **WHEN** the bot stops
- **THEN** the in-memory decrypted wallet SHALL be wiped

### Requirement: Wallet Replacement Confirmation
The system SHALL require explicit confirmation before replacing an existing imported wallet.

#### Scenario: Confirm replacement
- **WHEN** the user attempts to import a new wallet and one already exists
- **THEN** the system SHALL prompt for explicit confirmation before overwriting

#### Scenario: Cancel replacement
- **WHEN** the user declines the replacement confirmation
- **THEN** the existing wallet SHALL remain unchanged

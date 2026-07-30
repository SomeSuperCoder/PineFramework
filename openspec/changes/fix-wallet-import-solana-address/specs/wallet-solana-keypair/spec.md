## ADDED Requirements

### Requirement: Ed25519 keypair derivation from seed phrase
The system SHALL derive Solana Ed25519 keypairs from BIP39 seed phrases using `@solana/web3.js`.

#### Scenario: Derive keypair from 12-word seed phrase
- **WHEN** a user imports a valid 12-word BIP39 seed phrase
- **THEN** the system derives an Ed25519 keypair using `Keypair.fromSeed()`
- **AND** the public key is a valid base58-encoded Solana address (32-44 characters)

#### Scenario: Derive keypair from 24-word seed phrase
- **WHEN** a user imports a valid 24-word BIP39 seed phrase
- **THEN** the system derives an Ed25519 keypair using `Keypair.fromSeed()`
- **AND** the public key is a valid base58-encoded Solana address (32-44 characters)

#### Scenario: Deterministic derivation
- **WHEN** the same seed phrase is imported twice
- **THEN** both imports produce identical public keys

### Requirement: Base58-encoded public key display
The system SHALL display public keys as base58-encoded Solana addresses.

#### Scenario: Display wallet address
- **WHEN** a wallet is imported successfully
- **THEN** the displayed address is a base58-encoded string
- **AND** the address matches the pattern `[1-9A-HJ-NP-Za-km-z]{32,44}`

### Requirement: Encrypted wallet storage compatibility
The system SHALL store the base58-encoded public key in the encrypted wallet file.

#### Scenario: Save wallet with new format
- **WHEN** a wallet is imported with the new derivation
- **THEN** the `EncryptedWallet.publicKey` field contains the base58 address
- **AND** the wallet can be decrypted and the keypair restored

#### Scenario: Load existing wallet
- **WHEN** the system loads an existing wallet file
- **THEN** it reads the public key from `EncryptedWallet.publicKey`
- **AND** the key format is preserved (no re-encoding)

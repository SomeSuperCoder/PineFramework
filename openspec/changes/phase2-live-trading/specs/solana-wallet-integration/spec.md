## Purpose

Integrates Solana wallet operations including balance reading, transaction signing, and key management.

## ADDED Requirements

### Requirement: Wallet Keypair Management

The system SHALL securely manage Solana keypairs for transaction signing.

#### Scenario: Keypair from seed phrase

- **WHEN** a wallet is imported with a seed phrase
- **THEN** the system SHALL derive the Solana keypair using BIP44 derivation path `m/44'/501'/0'/0'`

#### Scenario: Keypair encryption at rest

- **WHEN** the keypair is stored in memory
- **THEN** the system SHALL encrypt it using AES-256-GCM with the configured passphrase

#### Scenario: Keypair zeroization

- **WHEN** the wallet is removed or bot stops
- **THEN** the system SHALL securely zero-fill the keypair memory

### Requirement: SOL Balance Query

The system SHALL query the wallet's native SOL balance from Solana RPC.

#### Scenario: Valid balance query

- **WHEN** balance is requested
- **THEN** the system SHALL call `getBalance` on the RPC endpoint and return lamports

#### Scenario: RPC unavailability

- **WHEN** the Solana RPC endpoint is unreachable
- **THEN** the system SHALL return an error with the RPC endpoint URL for debugging

### Requirement: SPL Token Balance Query

The system SHALL query SPL token balances via Associated Token Accounts.

#### Scenario: Token balance query

- **WHEN** balance is requested for a specific token mint
- **THEN** the system SHALL derive the Associated Token Account address and query its balance

#### Scenario: Multiple token balances

- **WHEN** balance is requested for multiple tokens
- **THEN** the system SHALL batch RPC calls where possible for efficiency

### Requirement: Transaction Construction

The system SHALL construct Solana transactions for token swaps.

#### Scenario: Swap transaction construction

- **WHEN** a Jupiter swap quote is received
- **THEN** the system SHALL deserialize the base64 transaction, set the fee payer, and prepare for signing

#### Scenario: Priority fees

- **WHEN** constructing a transaction
- **THEN** the system SHALL include compute unit price and compute unit limit for priority fee configuration

### Requirement: Transaction Signing and Submission

The system SHALL sign and submit transactions to the Solana network.

#### Scenario: Full swap lifecycle

- **WHEN** a swap is initiated
- **THEN** the system SHALL:
  1. Get quote from Jupiter API
  2. Get swap transaction from Jupiter API
  3. Deserialize and sign the transaction
  4. Submit to Solana RPC
  5. Wait for confirmation
  6. Return success with transaction signature

#### Scenario: Partial failure handling

- **WHEN** any step in the lifecycle fails
- **THEN** the system SHALL return a descriptive error indicating which step failed

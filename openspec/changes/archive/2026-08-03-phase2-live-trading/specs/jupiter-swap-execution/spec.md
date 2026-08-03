## Purpose

Completes the Jupiter DEX adapter to sign and submit real Solana transactions for token swaps.

## ADDED Requirements

### Requirement: Transaction Signing

The system SHALL sign swap transactions using the wallet's private key before submission.

#### Scenario: Valid signature

- **WHEN** a swap transaction is received from Jupiter API
- **THEN** the system SHALL deserialize the transaction, sign it with the wallet keypair, and return the signed transaction

#### Scenario: Signing failure

- **WHEN** transaction signing fails (invalid key, corrupted transaction)
- **THEN** the system SHALL return an error with descriptive message

### Requirement: Transaction Submission

The system SHALL submit signed transactions to the Solana network via RPC.

#### Scenario: Successful submission

- **WHEN** a signed transaction is ready
- **THEN** the system SHALL submit it to the configured Solana RPC endpoint and return the transaction signature

#### Scenario: RPC failure handling

- **WHEN** the Solana RPC endpoint is unreachable or returns an error
- **THEN** the system SHALL retry with exponential backoff (max 3 attempts)

#### Scenario: Transaction simulation

- **WHEN** a transaction is about to be submitted
- **THEN** the system SHALL simulate the transaction first to catch errors before broadcasting

### Requirement: Transaction Confirmation

The system SHALL wait for transaction confirmation before reporting success.

#### Scenario: Confirmed transaction

- **WHEN** a transaction is submitted
- **THEN** the system SHALL poll for confirmation (max 60 seconds) and return success when confirmed

#### Scenario: Transaction timeout

- **WHEN** confirmation takes longer than 60 seconds
- **THEN** the system SHALL return a timeout error with the transaction signature for manual inspection

#### Scenario: Transaction failure on-chain

- **WHEN** the transaction fails on-chain (insufficient funds, slippage exceeded)
- **THEN** the system SHALL return an error with the on-chain error message

### Requirement: Balance Reading

The system SHALL query real SOL and token balances from Solana RPC.

#### Scenario: SOL balance

- **WHEN** balance is requested for native SOL
- **THEN** the system SHALL return the wallet's SOL balance in lamports

#### Scenario: SPL token balance

- **WHEN** balance is requested for an SPL token (e.g., USDC)
- **THEN** the system SHALL query the Associated Token Account and return the token balance

#### Scenario: Account not found

- **WHEN** the token account doesn't exist (zero balance)
- **THEN** the system SHALL return balance of 0 (not an error)

### Requirement: Slippage Protection

The system SHALL enforce slippage tolerance on all swaps.

#### Scenario: Slippage exceeded

- **WHEN** the output amount is less than expected minus slippage tolerance
- **THEN** the system SHALL reject the swap and return an error

#### Scenario: Configurable slippage

- **WHEN** the user configures slippage tolerance (e.g., 100 bps = 1%)
- **THEN** the system SHALL use the configured value instead of default (50 bps)

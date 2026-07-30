## ADDED Requirements

### Requirement: Fetch USDC balance for a public key
The system SHALL provide an endpoint to fetch the USDC SPL token balance for a given Solana public key.

#### Scenario: Successful balance fetch
- **WHEN** a GET request is made to `/api/bot/wallet/balance`
- **THEN** the system queries Solana mainnet RPC for USDC token accounts
- **AND** returns `{ success: true, balance: <number> }` where balance is the UI amount (e.g., 1234.56)

#### Scenario: Wallet with no USDC
- **WHEN** the public key has no USDC token account
- **THEN** the system returns `{ success: true, balance: 0 }`

#### Scenario: RPC failure
- **WHEN** the Solana RPC is unreachable or returns an error
- **THEN** the system returns `{ success: false, error: <message> }` with HTTP 502

#### Scenario: Missing public key
- **WHEN** no `publicKey` query parameter is provided
- **THEN** the system returns `{ success: false, error: "Missing publicKey" }` with HTTP 400

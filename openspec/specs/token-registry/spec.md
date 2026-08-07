## Purpose

Centralized registry of verified Solana token mint addresses as single source of truth, eliminating duplicate declarations and ensuring all trading code uses correct, verified addresses.
## Requirements
### Requirement: Token registry SHALL be single source of truth
The system SHALL maintain a single centralized registry file containing all verified Solana token mint addresses. All trading-related code SHALL import mint addresses from this registry instead of declaring them locally.

#### Scenario: Registry provides correct mint addresses
- **WHEN** any trading component needs a token mint address
- **THEN** it imports the address from the centralized registry
- **AND** the address matches the verified on-chain mint address

### Requirement: Registry SHALL include all actively traded tokens
The registry SHALL contain verified mint addresses for all tokens the bot trades: SOL, USDC, USDT, BTC, ETH, BNB, JUP, mSOL, RAY, ORCA, PYTH, MNDE, SRM, BONK, WIF, stSOL, jitoSOL, bSOL.

#### Scenario: All tokens have verified addresses
- **WHEN** a token is added to the trading bot's supported list
- **THEN** its mint address in the registry SHALL be verified against official sources (Coinbase, CoinGecko, protocol documentation)

### Requirement: stSOL address SHALL be corrected
The registry SHALL use the correct Lido Staked SOL mint address: `7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj`

#### Scenario: stSOL swaps use correct address
- **WHEN** bot executes a swap involving stSOL
- **THEN** the transaction targets the real Lido Staked SOL mint
- **AND** the swap succeeds on-chain

### Requirement: BTC address SHALL use Wormhole variant
The registry SHALL use the Wormhole-wrapped BTC mint address: `3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh` for all BTC references. The deprecated Sollet-wrapped BTC SHALL NOT be used.

#### Scenario: BTC swaps use Wormhole variant
- **WHEN** bot executes a swap involving BTC
- **THEN** the transaction targets the Wormhole-wrapped BTC mint
- **AND** the swap has adequate liquidity on Jupiter/Raydium

### Requirement: Duplicate declarations SHALL be removed
Files that currently declare their own USDC_MINT, SOL_MINT, or other token addresses SHALL be updated to import from the centralized registry.

#### Scenario: No duplicate mint declarations
- **WHEN** codebase is searched for mint address strings
- **THEN** each address appears only in the registry file
- **AND** all other files import from registry

### Requirement: Registry SHALL expose USDC mint
The registry SHALL define a canonical USDC mint address (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) accessible to all trading modules. Any module importing `USDC_MINT` SHALL receive this address at runtime, never `undefined`.

#### Scenario: USDC_MINT resolves everywhere
- **WHEN** a trading module imports `USDC_MINT` from the registry
- **THEN** the value SHALL be the canonical mainnet USDC address
- **AND** it SHALL NOT be `undefined`

#### Scenario: DEX balance query uses USDC mint
- **WHEN** the executor queries the DEX balance for USDC
- **THEN** the mint SHALL resolve to the canonical address
- **AND** the balance SHALL NOT default to zero due to an undefined mint


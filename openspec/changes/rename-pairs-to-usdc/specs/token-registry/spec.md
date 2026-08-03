## MODIFIED Requirements

### Requirement: Token registry SHALL be single source of truth
The system SHALL maintain a single centralized registry file containing all verified Solana token mint addresses. All trading-related code SHALL import mint addresses from this registry instead of declaring them locally. All pair symbols in the registry SHALL use USDC as the quote token.

#### Scenario: Registry provides correct mint addresses
- **WHEN** any trading component needs a token mint address
- **THEN** it imports the address from the centralized registry
- **AND** the address matches the verified on-chain mint address

#### Scenario: All pair symbols use USDC
- **WHEN** pair symbols are defined in the registry
- **THEN** they use USDC as the quote token (e.g., "BTCUSDC", "ETHUSDC")

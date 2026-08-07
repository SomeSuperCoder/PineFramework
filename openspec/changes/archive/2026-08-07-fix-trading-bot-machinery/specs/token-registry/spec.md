## ADDED Requirements

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

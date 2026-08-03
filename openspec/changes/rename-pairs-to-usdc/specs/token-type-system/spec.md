## MODIFIED Requirements

### Requirement: PairSymbol type SHALL represent valid trading pairs
The system SHALL export a `PairSymbol` branded type that represents valid trading pair symbols (e.g., "BTCUSDC", "ETHUSDC"). Only values present in the canonical registry SHALL be assignable to this type.

#### Scenario: Type safety for pair symbols
- **WHEN** code references a pair symbol
- **THEN** TypeScript enforces it is a valid `PairSymbol` from the registry
- **AND** invalid symbols cause a compile-time error

### Requirement: TRADABLE_PAIRS SHALL be the canonical list
The system SHALL export `TRADABLE_PAIRS` as the single source of truth for all symbols the bot can trade. This constant SHALL be used by all dropdowns, auto-select logic, and frontend symbol lists. All pair symbols SHALL use USDC as the quote token (e.g., "BTCUSDC", "ETHUSDC").

#### Scenario: Dropdowns use canonical list
- **WHEN** frontend renders a pair selection dropdown
- **THEN** it iterates over `TRADABLE_PAIRS` from the registry
- **AND** no hardcoded symbol arrays exist outside the registry

#### Scenario: All pairs use USDC quote
- **WHEN** any pair symbol is referenced
- **THEN** it ends with "USDC" (not "USDT")

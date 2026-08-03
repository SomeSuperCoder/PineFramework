## Purpose

Establish a single source of truth for token symbols and their Solana mint addresses, with TypeScript types that enforce a one-to-one mapping between trading pair symbols and token information, used by all dropdowns and trading logic.

## ADDED Requirements

### Requirement: PairSymbol type SHALL represent valid trading pairs
The system SHALL export a `PairSymbol` branded type that represents valid trading pair symbols (e.g., "BTCUSDT", "ETHUSDT"). Only values present in the canonical registry SHALL be assignable to this type.

#### Scenario: Type safety for pair symbols
- **WHEN** code references a pair symbol
- **THEN** TypeScript enforces it is a valid `PairSymbol` from the registry
- **AND** invalid symbols cause a compile-time error

### Requirement: TokenInfo SHALL contain all token metadata
The system SHALL export a `TokenInfo` type containing: `symbol` (base token like "BTC"), `pairSymbol` (trading pair like "BTCUSDT"), `name` (display name like "Bitcoin"), `mint` (Solana address), and `decimals` (token decimals).

#### Scenario: Token info is complete
- **WHEN** code requests token info for a pair
- **THEN** it receives symbol, pairSymbol, name, mint, and decimals

### Requirement: TRADABLE_PAIRS SHALL be the canonical list
The system SHALL export `TRADABLE_PAIRS` as the single source of truth for all symbols the bot can trade. This constant SHALL be used by all dropdowns, auto-select logic, and frontend symbol lists.

#### Scenario: Dropdowns use canonical list
- **WHEN** frontend renders a pair selection dropdown
- **THEN** it iterates over `TRADABLE_PAIRS` from the registry
- **AND** no hardcoded symbol arrays exist outside the registry

### Requirement: TOKEN_REGISTRY SHALL map pairs to token info
The system SHALL export `TOKEN_REGISTRY` as a `Record<PairSymbol, TokenInfo>` mapping each pair symbol to its complete token information. This is the ONLY place token addresses are defined.

#### Scenario: Single source of truth for addresses
- **WHEN** any code needs a token mint address
- **THEN** it calls `getTokenInfo(pairSymbol).mint`
- **AND** no other file contains hardcoded mint addresses

### Requirement: Helper functions SHALL provide type-safe access
The system SHALL export `getTokenInfo(pairSymbol)`, `getTradablePairs()`, and `isValidPairSymbol(value)` helpers. `getTokenInfo` SHALL throw for invalid symbols. `getTradablePairs` SHALL return the list of valid pair symbols.

#### Scenario: Type-safe token lookup
- **WHEN** code calls `getTokenInfo("BTCUSDT")`
- **THEN** it receives the TokenInfo for Bitcoin
- **AND** the return type is `TokenInfo` (not `TokenInfo | undefined`)

#### Scenario: Invalid symbol throws
- **WHEN** code calls `getTokenInfo("INVALID")`
- **THEN** it throws an error with available symbols

### Requirement: Frontend SHALL import symbols from registry
All frontend components that display or handle pair symbols SHALL import `TRADABLE_PAIRS` or `getTradablePairs()` from the token registry. No hardcoded symbol arrays SHALL exist in frontend code.

#### Scenario: No hardcoded symbols in frontend
- **WHEN** frontend code is searched for symbol arrays
- **THEN** no matches found outside the registry import

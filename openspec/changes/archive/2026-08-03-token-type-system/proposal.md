## Why

Token symbols and addresses are scattered across multiple files with no enforced correspondence. The backend uses `SOL`, `BTC`, `ETH` as symbols while the frontend uses `BTCUSDT`, `ETHUSDT`, `SOLUSDT`. There's no type-safe way to ensure a symbol maps to exactly one address, and dropdowns hardcode their own symbol lists. This leads to drift, bugs, and no single place to add a new token.

## What Changes

- **BREAKING**: Replace `Record<string, string>` token maps with a typed `TokenInfo` object containing symbol, display name, mint address, and decimals
- Create `TRADABLE_PAIRS` constant: the canonical list of all symbols the bot can trade (e.g., `BTCUSDT`, `ETHUSDT`)
- Create `TOKEN_REGISTRY` as the single source of truth mapping each pair symbol to its token info
- Export `PairSymbol` branded type for type-safe symbol references
- Export `getTradablePairs()` for dropdowns, `getTokenInfo(pairSymbol)` for trading logic
- Update all frontend dropdowns and backend symbol references to use the registry
- Remove hardcoded `SYMBOLS` arrays from `App.tsx`, `auto-select.ts`, `TradingBotPanel.tsx`

## Capabilities

### New Capabilities
- `token-type-system`: Typed token registry with `PairSymbol`, `TokenInfo`, and `TRADABLE_PAIRS` as single source of truth for all symbol/address mappings

### Modified Capabilities
<!-- No existing spec-level behavior changes -->

## Impact

- **Files affected**: `src/trading/token-registry.ts` (rewrite), `src/trading/auto-select.ts`, `frontend/src/App.tsx`, `frontend/src/components/TradingBotPanel.tsx`, and all files importing token addresses
- **Risk**: Breaking change requires updating all symbol references
- **Dependencies**: No new dependencies

## Non-goals

- Changing trading logic or strategy behavior
- Adding new tokens beyond current set
- Runtime on-chain validation of addresses

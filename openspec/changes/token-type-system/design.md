## Context

Token symbols and addresses are scattered across multiple files:
- `src/trading/token-registry.ts`: `Record<string, string>` maps for native and bridged tokens
- `src/trading/auto-select.ts`: `DEFAULT_SYMBOLS` array
- `frontend/src/App.tsx`: `SYMBOLS` array
- `frontend/src/components/TradingBotPanel.tsx`: hardcoded dropdown options

The backend uses base symbols (`SOL`, `BTC`) while frontend uses pair symbols (`BTCUSDT`, `ETHUSDT`). No type safety exists between them. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Single source of truth for all token symbols and addresses
- Type-safe `PairSymbol` branded type preventing invalid symbols
- `TokenInfo` type combining symbol, address, name, and decimals
- All dropdowns and trading code import from one registry
- Eliminate all hardcoded symbol arrays

**Non-Goals:**
- Changing trading logic or strategy behavior
- Adding new tokens beyond current set
- Runtime on-chain validation of addresses

## Decisions

### Decision: Use branded type for PairSymbol

**Rationale**: Branded types (`type PairSymbol = string & { __brand: 'PairSymbol' }`) provide compile-time safety without runtime overhead. Invalid symbols cause TypeScript errors, not runtime bugs.

**Alternatives considered**:
- String enum: Less flexible, can't derive from data
- Union type (`'BTCUSDT' | 'ETHUSDT' | ...`): Can't be derived from registry data

### Decision: Pair symbols use "XXXUSDT" format consistently

**Rationale**: The frontend already uses `BTCUSDT` format. Standardizing on this eliminates the backend's `SOL` vs `SOLUSDT` confusion. The registry maps `BTCUSDT` → `{ symbol: 'BTC', pairSymbol: 'BTCUSDT', ... }`.

**Alternatives considered**:
- Keep backend as `SOL`, frontend as `SOLUSDT`: Creates confusion and mapping overhead
- Use `SOL/USDT` format: Unnecessarily complex for code

### Decision: Single TOKEN_REGISTRY object instead of separate maps

**Rationale**: One `Record<PairSymbol, TokenInfo>` is easier to maintain than separate `TOKEN_MINTS`, `BRIDGED_MINTS`, and `DEFAULT_SYMBOLS`. Adding a token means adding one entry.

**Alternatives considered****
- Keep separate maps: More places to update, more drift risk
- Class with methods: Over-engineered for a data structure

### Decision: Frontend imports from shared package

**Rationale**: Both frontend and backend import from `src/trading/token-registry.ts`. In a monorepo, this could become a shared package, but for now direct import works.

**Alternatives considered**:
- Duplicate registry in frontend: Violates SSOT
- API call to backend: Unnecessary latency for static data

## Risks / Trade-offs

**[Risk]** Branded types add complexity for new developers → **Mitigation**: Clear JSDoc comments and helper functions make usage obvious

**[Risk]** Changing all symbol references is large diff → **Mitigation**: Mechanical search-and-replace, can be done file-by-file

**[Risk]** Frontend build may need path adjustment → **Mitigation**: Vite resolves TypeScript paths, just ensure import path is correct

## Migration Plan

1. Rewrite `token-registry.ts` with typed `PairSymbol`, `TokenInfo`, `TRADABLE_PAIRS`
2. Update backend files to use new types
3. Update frontend files to import from registry
4. Remove hardcoded arrays from `App.tsx`, `auto-select.ts`, `TradingBotPanel.tsx`
5. Run `pnpm typecheck` to verify type safety
6. Run `pnpm test` to verify no regressions

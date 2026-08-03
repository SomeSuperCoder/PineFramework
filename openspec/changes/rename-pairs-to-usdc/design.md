## Context

The trading bot uses pair symbols like "BTCUSDT" for display and data fetching (from Bybit), but actual on-chain swaps on Solana use USDC as the quote token. This creates a conceptual mismatch where users see "USDT" pairs but trade against USDC. The token registry (`src/trading/token-registry.ts`) is the single source of truth for pair symbols, and all frontend/backend code imports from it.

## Goals / Non-Goals

**Goals:**
- Align pair symbols with the actual quote token (USDC)
- Maintain backward compatibility with Bybit data fetching
- Update all user-facing displays to show USDC pairs

**Non-Goals:**
- Change the USDC mint address (already correct)
- Modify Jupiter DEX integration (already uses USDC)
- Update historical price data cache
- Change Bybit API configuration

## Decisions

### Decision 1: Rename pair symbols to USDC
**Choice**: Change all pair symbols from USDT to USDC (e.g., BTCUSDT → BTCUSDC)
**Rationale**: Accurately reflects what we trade against. Users should see what they're actually trading.
**Alternatives considered**:
- Keep USDT symbols, add disclaimer (rejected - confusing, users won't read disclaimers)
- Use generic names without quote (rejected - loses important context)

### Decision 2: Handle Bybit data fetching
**Choice**: Map USDC pair symbols to Bybit's USDT pairs for data fetching
**Rationale**: Bybit doesn't have USDC pairs for all tokens, but USDT pairs have the same price data
**Implementation**: In `fetch-bars.ts`, strip the quote token and append "USDT" for Bybit API calls

### Decision 3: Update TokenInfo interface
**Choice**: Add `quote` field to TokenInfo (already done in token-type-system change)
**Rationale**: Makes the quote token explicit in the type system
**Alternative considered**: Derive from pairSymbol (rejected - fragile, requires string parsing)

## Risks / Trade-offs

**[Risk]** Bybit may not have USDC pairs for all tokens → **Mitigation**: Use USDT pairs for data fetching, they have identical price data

**[Risk]** External integrations may reference old USDT symbols → **Mitigation**: This is a breaking change, document in commit message and changelog

**[Risk]** Cached data may have old symbols → **Mitigation**: Cache uses full key `symbol:timeframe`, old entries will be ignored

## Migration Plan

1. Update token registry with USDC pair symbols
2. Update frontend dropdowns
3. Update backend imports and references
4. Test data fetching still works with Bybit
5. Verify all dropdowns show USDC pairs

No rollback needed - this is a simple rename with no data migration.

## Context

The wallet import flow returns a public key but no balance information. Users must externally verify the address matches their expected wallet. Showing USDC balance immediately provides a quick visual confirmation.

The `@solana/web3.js` library (already installed) provides `Connection` and `getParsedTokenAccountsByOwner` to fetch SPL token balances. USDC on Solana mainnet has mint address `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.

## Goals / Non-Goals

**Goals:**
- Fetch USDC balance after wallet import
- Display balance in the wallet status area
- Show loading state while fetching
- Handle errors gracefully (network issues, RPC failures)

**Non-goals:**
- Real-time balance updates
- Multi-token support
- Balance caching or polling
- Solana mainnet/devnet selector (hardcode mainnet)

## Decisions

### 1. Backend endpoint for balance fetch

**Choice:** Add `GET /api/bot/wallet/balance` that uses `@solana/web3.js` Connection to query USDC balance.

**Rationale:**
- Keeps RPC calls server-side (avoids CORS, key exposure)
- Backend already has Solana dependencies
- Simple GET endpoint, easy to test

**Alternative considered:** Frontend direct RPC call
- Rejected: Exposes RPC endpoint to client, potential CORS issues

### 2. USDC balance retrieval method

**Choice:** Use `getParsedTokenAccountsByOwner` with USDC mint filter.

**Rationale:**
- Standard method for SPL token balance queries
- Returns parsed data including UI amount (human-readable)
- Handles edge cases (no account = zero balance)

### 3. Display location

**Choice:** Show balance next to the public key in the wallet status area.

**Rationale:**
- Natural location — user sees address and balance together
- Minimal UI change
- Consistent with wallet import confirmation flow

## Risks / Trade-offs

**[Risk] RPC rate limits** → Single call on import, not polling. Low risk.

**[Risk] Network latency** → Show loading indicator. Timeout after 10s.

**[Trade-off] Mainnet only** → Hardcoded mainnet RPC. Devnet USDC has no real value, but users testing may want devnet balance. Can add network selector later.

## Migration Plan

1. Deploy backend with new endpoint
2. Deploy frontend with balance fetch on import
3. No data migration needed

## Open Questions

- Should we show SOL balance too, or just USDC?

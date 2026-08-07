## Context

The Jupiter API integration has 3 critical bugs preventing chaos mode from testing real API calls:

1. **Unit mismatch**: Chaos mode initializes with simulated $10,000 capital, causing `executeSignal()` to calculate swap amounts as dust (~100 lamports = $0.0001)
2. **Route format**: `quote()` converts `routePlan` array to string (`"amm1 → amm2"`), then `swap()` sends this string back, causing Jupiter API validation errors
3. **Devnet default**: `createSolanaConfig()` defaults to devnet, so without env var, all transactions go to testnet

## Goals / Non-Goals

**Goals:**
- Fix unit mismatch so swap amounts reflect real wallet balance
- Fix route format to preserve `routePlan` array for Jupiter API compatibility
- Ensure mainnet is used when testing with real funds
- Maintain backward compatibility with existing non-chaos trading

**Non-Goals:**
- Modifying chaos signal generation logic
- Adding new risk management features
- Changing position sizing (remains 10%)
- Fixing the Ultra adapter (out of scope)

## Decisions

### Decision 1: Use real balance instead of simulated capital

**Choice**: Modify `live-strategy-executor.ts` to fetch actual wallet balance via `dex.getBalance()` and use that for chaos mode calculations.

**Rationale**: Chaos mode's purpose is to test real API integration. Using simulated capital defeats this purpose. The 10% position sizing should apply to real funds.

**Alternatives considered**:
- Pass balance as parameter to `executeSignal()` — Rejected: requires API changes
- Hardcode $7 balance — Rejected: not flexible, breaks if balance changes

### Decision 2: Preserve routePlan as array in Quote type

**Choice**: Update the `Quote` interface in `jupiter-swap-adapter.ts` to include `routePlan: any[]` and populate it directly from Jupiter's response.

**Rationale**: Jupiter API v6 expects `routePlan` array in swap requests. Converting to string loses information. Preserving the array ensures API compatibility.

**Alternatives considered**:
- Reconstruct routePlan from string — Rejected: lossy conversion, fragile
- Send both route (string) and routePlan (array) — Rejected: redundant, API may reject unknown fields

### Decision 3: Default to mainnet-beta for chaos mode

**Choice**: Change `createSolanaConfig()` default from `devnet` to `mainnet-beta` and add logging to show which network is being used.

**Rationale**: Chaos mode is specifically for testing real API integration. Defaulting to devnet defeats this purpose. Users running chaos mode expect mainnet.

**Alternatives considered**:
- Keep devnet default, require env var — Rejected: user expects chaos mode to test real API
- Add chaos-mode-specific config — Rejected: over-engineering for this fix

## Risks / Trade-offs

**Risk**: Real money trades after fix → **Mitigation**: Error handling already exists; $7 budget limits losses; user is aware this is a test

**Risk**: Breaking existing non-chaos trading → **Mitigation**: Changes are isolated to chaos mode path; non-chaos uses different code paths

**Risk**: Route format change may affect other adapters → **Mitigation**: Only JupiterSwapAdapter is modified; Ultra adapter is out of scope

## Migration Plan

1. Deploy changes to testnet first (if possible)
2. Verify chaos mode executes trades successfully on testnet
3. Deploy to mainnet
4. Run chaos mode with $7 budget
5. Monitor trades and errors
6. Rollback if issues arise (revert to devnet default)

## Open Questions

None — all decisions are clear and well-constrained.

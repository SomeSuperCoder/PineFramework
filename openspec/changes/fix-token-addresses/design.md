## Context

The codebase currently has token mint addresses declared in 6 different files, with duplicate USDC_MINT and SOL_MINT declarations. The stSOL address is incorrect (points to non-existent token), and BTC uses deprecated Sollet-wrapped variant. Additionally, the manual pair/timeframe selection was changed from `<select>` dropdowns to text inputs, which the user wants reverted. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Single source of truth for all token mint addresses
- Correct the stSOL address to real Lido Staked SOL
- Standardize BTC to use Wormhole variant
- Remove all duplicate mint declarations
- Revert manual selection UI to `<select>` dropdowns with expanded options

**Non-Goals:**
- Runtime on-chain address validation
- Changing token selection or trading logic
- Verifying all 20+ addresses (only fixing confirmed issues)
- Keeping text input flexibility for manual selection

## Decisions

### Decision: Create `src/trading/token-registry.ts` as centralized registry

**Rationale**: A single file exporting all verified addresses eliminates duplication and makes future address updates trivial. Importing from one file is cleaner than scattered constants.

**Alternatives considered**:
- JSON config file: Rejected because TypeScript imports provide type safety and IDE autocomplete
- Class with static methods: Over-engineered for a simple address mapping

### Decision: Export as `Record<string, string>` with typed helpers

**Rationale**: Simple key-value mapping is sufficient. Adding `getTokenMint(symbol: string)` helper provides validation and clear error messages for unknown symbols.

**Alternatives considered**:
- Branded types: Unnecessary complexity for address strings
- Map class: Plain object is simpler and JSON-serializable

### Decision: Keep existing `TOKEN_MINTS` and `BRIDGED_MINTS` structure

**Rationale**: The current separation between native Solana tokens and bridged/foreign tokens is logically sound. Maintaining this structure in the registry preserves clarity.

### Decision: Revert manual selection to `<select>` dropdowns

**Rationale**: Text inputs introduced complexity (validation, warnings, auto-uppercase) without clear benefit. Dropdowns are simpler, prevent invalid inputs, and provide a curated list of commonly traded pairs and timeframes.

**Alternatives considered**:
- Hybrid dropdown + text input: Rejected as over-complicated for this use case
- Keep text inputs: User explicitly requested revert to dropdowns

### Decision: Expand dropdown options beyond original set

**Rationale**: Original had only 3 pairs and 4 timeframes. Expanding to 7 pairs (BTC, ETH, SOL, BNB, XRP, DOGE, ADA) and 7 timeframes (1m, 5m, 15m, 30m, 1h, 4h, 1d) covers the most commonly traded assets and intervals without overwhelming the user.

## Risks / Trade-offs

**[Risk]** Import cycle if registry imports from trading modules → **Mitigation**: Registry is a leaf module with zero imports from trading code

**[Risk]** Breaking existing imports if files expect local constants → **Mitigation**: Update all import sites in same change, verify with TypeScript compiler

**[Risk]** Address verification may be incomplete for some tokens → **Mitigation**: Only fixing confirmed issues (stSOL, BTC), leaving others as-is with comment noting verification status

## Migration Plan

1. Create registry file with all addresses
2. Update each file to import from registry
3. Remove local declarations
4. Revert TradingBotPanel.tsx manual selection from text inputs to `<select>` dropdowns
5. Expand dropdown options to 7 pairs and 7 timeframes
6. Run `pnpm typecheck` to verify no broken imports
7. Run existing tests to verify no regressions

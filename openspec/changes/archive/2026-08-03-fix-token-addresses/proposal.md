## Why

A security audit of all Solana token mint addresses in the codebase revealed one confirmed incorrect address (stSOL) and one inconsistent address (BTC) that could cause the bot to trade wrong tokens or lose funds. The stSOL address points to a non-existent token, and the BTC address uses a deprecated Sollet-wrapped version instead of the canonical Wormhole-wrapped version.

## What Changes

- **BREAKING**: Fix stSOL mint address from `7dHbWXmci3dT8UFYWqweMEc6c4uyiQvRY4HcT2z7e6c` to `7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj` (the real Lido Staked SOL)
- Standardize BTC mint address across all files to use Wormhole BTC (`3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh`) instead of deprecated Sollet BTC
- Add centralized token registry as single source of truth for all mint addresses
- Unify duplicate USDC_MINT and SOL_MINT declarations across multiple files
- Revert manual pair/timeframe selection from text inputs back to `<select>` dropdowns with expanded options (7 pairs, 7 timeframes)

## Capabilities

### New Capabilities
- `token-registry`: Centralized registry of all verified Solana token mint addresses with validation
- `manual-select-dropdowns`: Revert manual pair/timeframe selection to `<select>` dropdowns with expanded options

### Modified Capabilities
<!-- No existing spec-level behavior changes, just address corrections and UI revert -->

## Impact

- **Files affected**: `src/strategy/jupiter-fee-fetcher.ts`, `src/trading/live-strategy-executor.ts`, `src/trading/solana-wallet.ts`, `src/trading/dex/spot-trading.ts`, `src/trading/dex/jupiter-ultra-adapter.ts`, `src/trading/dex/jupiter-swap-adapter.ts`, `frontend/src/components/TradingBotPanel.tsx`
- **Risk**: Incorrect stSOL address would cause failed swaps or wrong token purchases
- **Risk**: Deprecated Sollet BTC may have liquidity issues vs Wormhole BTC
- **Dependencies**: No new dependencies

## Non-goals

- Verifying all 20+ addresses exhaustively (BNB, bSOL, MNDE, SRM remain unverified but appear correct)
- Changing token selection logic or trading strategies
- Adding on-chain address validation at runtime

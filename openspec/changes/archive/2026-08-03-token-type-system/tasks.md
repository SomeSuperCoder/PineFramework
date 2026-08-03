## 1. Rewrite Token Registry with Types

- [x] 1.1 Define `PairSymbol` branded type and `TokenInfo` interface in `src/trading/token-registry.ts`
- [x] 1.2 Define `TRADABLE_PAIRS` constant as `readonly PairSymbol[]` with all 7 trading pairs
- [x] 1.3 Define `TOKEN_REGISTRY` as `Record<PairSymbol, TokenInfo>` with complete token metadata
- [x] 1.4 Export helper functions: `getTokenInfo()`, `getTradablePairs()`, `isValidPairSymbol()`
- [x] 1.5 Remove old `TOKEN_MINTS`, `BRIDGED_MINTS`, `ALL_TOKEN_MINTS` exports
- [x] 1.6 Keep backward-compatible `TOKEN_MINTS` and `BRIDGED_MINTS` as derived from registry

## 2. Update Backend Imports

- [x] 2.1 Update `src/strategy/jupiter-fee-fetcher.ts` to use new registry exports
- [x] 2.2 Update `src/trading/live-strategy-executor.ts` to use `getTokenInfo()` instead of `getTokenMint()`
- [x] 2.3 Update `src/trading/solana-wallet.ts` to import from new registry
- [x] 2.4 Update `src/trading/dex/spot-trading.ts` to use registry
- [x] 2.5 Update `src/trading/dex/jupiter-ultra-adapter.ts` to use registry
- [x] 2.6 Update `src/trading/dex/jupiter-swap-adapter.ts` to use registry
- [x] 2.7 Update `src/trading/auto-select.ts` to import `TRADABLE_PAIRS` instead of `DEFAULT_SYMBOLS`

## 3. Update Frontend Imports

- [x] 3.1 Update `frontend/src/App.tsx` to import `TRADABLE_PAIRS` from registry
- [x] 3.2 Update `frontend/src/components/TradingBotPanel.tsx` to use `TRADABLE_PAIRS` for dropdowns
- [x] 3.3 Remove hardcoded `SYMBOLS` array from `App.tsx`
- [x] 3.4 Remove hardcoded dropdown options from `TradingBotPanel.tsx`

## 4. Verify

- [x] 4.1 Run `pnpm typecheck` to verify type safety
- [x] 4.2 Run `pnpm test` to verify no regressions
- [x] 4.3 Grep codebase to confirm no hardcoded symbol arrays remain outside registry

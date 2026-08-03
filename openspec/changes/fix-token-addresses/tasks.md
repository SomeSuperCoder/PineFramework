## 1. Create Token Registry

- [x] 1.1 Create `src/trading/token-registry.ts` with all verified token addresses
- [x] 1.2 Add `getTokenMint(symbol: string)` helper function with error handling
- [x] 1.3 Add `TOKEN_MINTS` and `BRIDGED_MINTS` exports matching current structure

## 2. Fix Incorrect Addresses

- [x] 2.1 Fix stSOL address to `7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj`
- [x] 2.2 Standardize BTC to Wormhole variant `3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh`

## 3. Update Import Sites

- [x] 3.1 Update `src/strategy/jupiter-fee-fetcher.ts` to import from registry
- [x] 3.2 Update `src/trading/live-strategy-executor.ts` to import from registry
- [x] 3.3 Update `src/trading/solana-wallet.ts` to import from registry
- [x] 3.4 Update `src/trading/dex/spot-trading.ts` to import from registry
- [x] 3.5 Update `src/trading/dex/jupiter-ultra-adapter.ts` to import from registry
- [x] 3.6 Update `src/trading/dex/jupiter-swap-adapter.ts` to import from registry

## 4. Remove Duplicate Declarations

- [x] 4.1 Remove local USDC_MINT declarations from all files
- [x] 4.2 Remove local SOL_MINT declarations from all files
- [x] 4.3 Remove local TOKEN_MINTS objects from individual files

## 5. Revert Manual Select Dropdowns

- [x] 5.1 Revert pair selection from text input to `<select>` dropdown with 7 options (BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT, DOGEUSDT, ADAUSDT)
- [x] 5.2 Revert timeframe selection from text input to `<select>` dropdown with 7 options (1m, 5m, 15m, 30m, 1h, 4h, 1d)
- [x] 5.3 Remove quick-select chips, validation messages, and warning for non-default symbols
- [x] 5.4 Set default pair to empty ("Select pair...") and default timeframe to "60" (1h)

## 6. Verify

- [x] 6.1 Run `pnpm typecheck` to verify no broken imports
- [x] 6.2 Run `pnpm test` to verify no regressions (pre-existing failures only)
- [x] 6.3 Grep codebase to confirm no duplicate mint address strings remain
- [x] 6.4 Manual test: verify dropdowns render correctly in manual selection mode

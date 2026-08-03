## 1. Update Token Registry

- [x] 1.1 Update `TRADABLE_PAIRS` to use USDC symbols (BTCUSDC, ETHUSDC, etc.)
- [x] 1.2 Update `TOKEN_REGISTRY` keys to use USDC pair symbols
- [x] 1.3 Update `TokenInfo.pairSymbol` values to USDC pairs
- [x] 1.4 Keep backward-compatible `TOKEN_MINTS.USDC` export unchanged

## 2. Update Backend Imports

- [x] 2.1 Update `src/strategy/jupiter-fee-fetcher.ts` if it references pair symbols
- [x] 2.2 Update `src/trading/live-strategy-executor.ts` to use new pair symbols
- [x] 2.3 Update `src/trading/dex/jupiter-swap-adapter.ts` if it references pair symbols
- [x] 2.4 Update `src/trading/auto-select.ts` to use new pair symbols
- [x] 2.5 Update `src/backend/bybit/fetch-bars.ts` to map USDC pairs to USDT for Bybit API

## 3. Update Frontend Imports

- [x] 3.1 Update `frontend/src/App.tsx` - TRADABLE_PAIRS import handles this automatically
- [x] 3.2 Update `frontend/src/components/TradingBotPanel.tsx` - dropdowns use TRADABLE_PAIRS

## 4. Verify

- [x] 4.1 Run `pnpm typecheck` to verify type safety
- [ ] 4.2 Run `pnpm test` to verify no regressions
- [ ] 4.3 Grep codebase to confirm no USDT pair symbols remain outside Bybit mapping

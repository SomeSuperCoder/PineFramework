## 1. Token registry & USDC mint (spec: token-registry)

- [x] 1.1 Add canonical USDC entry to `TOKEN_MINTS` in `src/trading/token-registry.ts` so `USDC_MINT` resolves at runtime
- [x] 1.2 Update `src/trading/solana-wallet.ts`, `src/trading/dex/jupiter-swap-adapter.ts`, `src/trading/dex/jupiter-ultra-adapter.ts`, `src/trading/dex/spot-trading.ts` to import USDC mint from the registry (no local `undefined`)
- [ ] 1.3 Verify `dex.getBalance(USDC_MINT, ...)` no longer receives `undefined` (unit test asserting canonical `EPjFWdd5...`)

## 2. Buy/sell sizing correctness (spec: trading-execution-correctness, chaos-test-mode)

- [x] 2.1 Extract `getTokenInfoForSymbol(symbol)` helper in `src/trading/live-strategy-executor.ts` mirroring `getMintForSymbol` fallback chain; use it in mint resolution
- [x] 2.2 Fix buy amount: `usdcAmount = availableBalanceUsdc * positionFraction` (whole USDC, no price division); `amount = BigInt(Math.floor(usdcAmount * 1_000_000))`
- [x] 2.3 Fix sell amount: `BigInt(Math.floor(signal.quantity * 10 ** decimals))` via `getTokenInfoForSymbol`
- [x] 2.4 Fix dust guard: compare whole-USDC `usdcAmount` vs `minTradeUsdc` (drop `* expectedPrice` confusion)
- [x] 2.5 Fix insufficient-balance guard: compare micro-to-micro (or remove, since amount derives from balance)
- [ ] 2.6 Add regression unit tests: buy spend = 10% of balance ± slippage; fractional sell sends `0.02 ETH → 2_000_000` lamports; dust guard skips below threshold

## 3. Risk gate enforcement (spec: wallet-balance-safety-guard)

- [x] 3.1 Call `riskManager.canEnterPosition()` at top of `executeSignal` for `action === 'buy'`; return `{ success: false, error: 'Entry blocked by risk controls' }` when false
- [ ] 3.2 Add regression test: after daily-loss breach, buy signal is blocked and no swap is submitted

## 4. Bot start lifecycle (spec: bot-start-lifecycle)

- [x] 4.1 In `src/trading/bot-engine.ts` `start()`: when `autoSelect` true and pairs empty, invoke `onAutoSelect` if configured; if no callback, throw with message "auto-selection returned no pairs"; keep state `Idle`
- [ ] 4.2 Update integration test `bot-lifecycle` 10.4 to match (add `totalPnlPercent` to mock, expect new messages)

## 5. Build & typecheck blockers (spec: trading-execution-correctness)

- [x] 5.1 Fix `src/trading/state-machine.ts` TS2322: make `StateTransition<TState>` generic (lines ~104,143,164)
- [x] 5.2 Fix `src/trading/wallet/wallet-manager.ts:198` TS2769: `Buffer.from(key)` plain copy (no hex decode)
- [x] 5.3 Fix `src/trading/wallet/wallet-manager.ts` `changePassword`: pass existing `publicKey` as third arg to `encryptSeedPhrase` so stored identity survives re-encryption
- [ ] 5.4 Fix `frontend/src/components/ChartComponent.tsx` 8 TS errors: type `plotColors`/`fillColorData` as `Record<string, (string | null)[]>` and shape `indicatorResults`

## 6. Stale tests & fixtures

- [ ] 6.1 Update `chaos-realistic-engine.test.ts`: equity expectation 10, qty `(10*0.1)/50000 = 0.00002`
- [ ] 6.2 Update `jupiter-swap-adapter.test.ts`: assert `quote.routePlan[0].swapInfo.ammKey` instead of `quote.route`
- [ ] 6.3 Update `solana-wallet.test.ts`: network default assertions to `mainnet-beta`; USDC mint assertion
- [ ] 6.4 Update `backend-services.test.ts`: expect `'ROLLING 24H LOSS LIMIT BREACHED'` message
- [ ] 6.5 Update `auto-select.test.ts`: add `totalPnlPercent` to mocks, drop `runParallel` case
- [ ] 6.6 Restore missing fixtures: `test_indicators/alternating-long-strategy.pine`, `tests/integration/alert-sanity/export.json`

## 7. Quality gates green

- [ ] 7.1 Run Prettier across repo (336 lint errors) — repo-wide pass after code changes
- [ ] 7.2 Run `just check` (typecheck:all + lint + build) — all green
- [ ] 7.3 Run `just test` — bot-relevant suites green; unrelated Pine-engine failures (HHLL, backbone, break-debug) documented as separate workstream
- [ ] 7.4 Confirm no bot process running before user's test run; report final state

## 8. QA sign-off

- [ ] 8.1 QA Engineer verifies every spec scenario from `trading-execution-correctness`, `chaos-test-mode`, `bot-start-lifecycle`, `wallet-balance-safety-guard`, `token-registry` deltas
- [ ] 8.2 QA issues GO/NO-GO verdict for the chaos-mode first practical test

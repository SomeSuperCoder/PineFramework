## Why

The live Solana trading bot (BotEngine + chaos mode) has never been run against a real DEX, and the user's first practical test is imminent. The machinery is currently broken in three ways that make a test run invalid and dangerous: trade sizing math is wrong (buys mis-sized by ~1/price, sells floor to zero), the risk system is decorative (`canEnterPosition()` is never called, so `maxDailyLoss` cannot stop a trade), and the project fails its own quality gates (build, typecheck, lint, and 7 bot-relevant test files). Additionally, `USDC_MINT` is `undefined` at runtime, which makes every balance query return $0 and would prevent chaos mode from trading at all. Fix these so the chaos-mode run produces valid, interpretable results with working safety brakes.

## What Changes

- **Fix `USDC_MINT` resolution (CRITICAL)**: add a USDC entry to `TOKEN_MINTS` (or import the canonical constant) so `solana-wallet.ts`, `jupiter-swap-adapter.ts`, `jupiter-ultra-adapter.ts`, and `spot-trading.ts` no longer receive `undefined` for the USDC mint. Without this, every DEX balance query returns 0 and no trade ever fires.
- **Fix buy sizing** (`live-strategy-executor.ts`): compute the swap amount as `availableBalanceUsdc * positionFraction` (whole USDC, NO price division), then convert to micro-USDC (`* 1_000_000`) for the input amount. Dust guard and insufficient-balance check must compare consistent units (micro-to-micro or whole-to-whole).
- **Fix sell sizing**: convert token quantity with the token's real decimals via a `getTokenInfoForSymbol(symbol)` helper (from `TOKEN_REGISTRY`, mirroring `getMintForSymbol` fallbacks), so fractional sells no longer floor to 0.
- **Enforce the risk gate**: call `riskManager.canEnterPosition()` at the top of `executeSignal` for buy actions; return `{ success: false, error: 'Entry blocked by risk controls' }` when it returns false. This makes `maxDailyLoss` (and rolling/wallet guards) actually stop entries after a loss.
- **Fix `BotEngine.start()` auto-select wiring** (`bot-engine.ts`): invoke `onAutoSelect` when auto-select is configured and pairs are empty, validate callback presence, and use the documented error messages so `bot-lifecycle` 10.4 passes.
- **Fix wallet identity on password change** (`wallet-manager.ts`): pass the existing `publicKey` to `encryptSeedPhrase` so `changePassword` no longer destroys the stored public key.
- **Fix build blockers**: `state-machine.ts` `StateTransition` generics (TS2322), `wallet-manager.ts:198` `Buffer.from` overload (TS2769), `frontend/src/components/ChartComponent.tsx` `unknown` types (8 TS errors).
- **Update stale tests + restore missing fixtures** so the suite reflects intentional behavior (mainnet default, routePlan quote shape, new risk-loss message, 10 USDC chaos equity, `totalPnlPercent` in auto-select mocks). Restore `test_indicators/alternating-long-strategy.pine` and `tests/integration/alert-sanity/export.json`.
- **Add regression tests** asserting buy spend = 10% of balance ± slippage, sells send correct token units, and the risk gate blocks entries when the daily loss is breached.
- **Formatting**: resolve the 336 repo-wide Prettier lint errors.

## Capabilities

### New Capabilities

- `trading-execution-correctness`: correct buy/sell sizing in the live DEX execution path (whole-USDC buy input, decimal-correct token sell amounts, consistent unit comparisons) and enforced risk-gating before every entry.

### Modified Capabilities

- `chaos-test-mode`: chaos signals must now execute at the correct size (10% of equity in USDC) instead of dust-sized buys; execution must be blocked by the risk gate when the daily loss limit is breached.
- `bot-start-lifecycle`: starting with auto-select configured and no pairs must invoke the auto-select callback instead of throwing before it is called; documented error messages apply.
- `wallet-balance-safety-guard`: `canEnterPosition()` is now actually called before entries, making the guard effective rather than decorative.
- `token-registry`: the token registry must include USDC so `USDC_MINT` resolves to the canonical mainnet mint everywhere it is imported.

## Impact

- **Code**: `src/trading/live-strategy-executor.ts`, `src/trading/bot-engine.ts`, `src/trading/token-registry.ts`, `src/trading/solana-wallet.ts`, `src/trading/dex/jupiter-swap-adapter.ts`, `src/trading/dex/jupiter-ultra-adapter.ts`, `src/trading/dex/spot-trading.ts`, `src/trading/state-machine.ts`, `src/trading/wallet/wallet-manager.ts`, `frontend/src/components/ChartComponent.tsx`.
- **Tests**: 7 bot-relevant unit/integration files updated; 2 fixtures restored; new regression tests for sizing and risk gate.
- **Non-goals**: Pine-engine chart/label test failures (HHLL, backbone, break-debug) are out of scope and tracked separately; wallet funding/verification and network choice remain the user's call; no changes to the chaos signal generator itself (randomness is intended).

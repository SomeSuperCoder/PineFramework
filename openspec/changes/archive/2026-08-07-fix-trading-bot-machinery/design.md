## Context

See proposal.md (Why/What) and the delta specs. Ground truth confirmed by Bug Hunter triage on 2026-08-05: the live execution path (`live-strategy-executor.ts`) mis-sizes buys by ~1/price, floors fractional sells to 0, has unit-inconsistent guards, and `USDC_MINT` is `undefined` at runtime in four modules because `TOKEN_MINTS` in `token-registry.ts` has no USDC key — which makes every balance query return 0 and prevents chaos mode from trading at all. `RiskManager.canEnterPosition()` exists but has zero production call sites. Quality gates are red (build, typecheck, lint, 7 bot-relevant test files).

## Goals / Non-Goals

**Goals:**
- Make the DEX execution path size trades correctly and consistently (spec: `trading-execution-correctness`).
- Make the risk system effective by gating every buy at the single choke point.
- Green quality gates for the bot's blast radius (build, typecheck, lint, bot tests).
- Update stale tests to reflect intentional behavior; add regression coverage for the fixed math and risk gate.

**Non-Goals:**
- Changing chaos signal randomness (intended).
- Fixing Pine-engine chart/label test failures (HHLL, backbone, break-debug) — separate workstream, reported only.
- Wallet funding/verification, network choice, or passphrase hardening — user's call, out of scope.

## Decisions

- **Fix `USDC_MINT` at the registry root.** Add a USDC entry to `TOKEN_MINTS` in `token-registry.ts` (or import the canonical `USDC_MINT` constant where `TOKEN_MINTS.USDC` is currently read). Rationale: one source of truth per the `token-registry` spec; fixes all four modules (solana-wallet, jupiter-swap-adapter, jupiter-ultra-adapter, spot-trading) with a single canonical constant. Alternative (per-module local constants) rejected — recreates the duplicate-declaration problem the spec forbids.
- **Extract `getTokenInfoForSymbol(symbol): { mint, decimals }`** in `live-strategy-executor.ts`, mirroring `getMintForSymbol`'s fallback chain (pair symbol → `${symbol}USDT` → fallback decimals 6). Used by both mint resolution and sell conversion. Rationale: single helper, DRY, one place to get token decimals (ETH/BTC=8, SOL=9 from `TOKEN_REGISTRY`).
- **Buy sizing: `usdcAmount = availableBalanceUsdc * positionFraction` (whole USDC, no price division); `amount = BigInt(Math.floor(usdcAmount * 1_000_000))`.** Dust guard compares whole-USDC vs `minTradeUsdc`; insufficient-balance check compares micro-to-micro. Rationale: units now match the DEX contract ("input amount in smallest units").
- **Sell sizing: `amount = BigInt(Math.floor(signal.quantity * 10 ** decimals))`** via `getTokenInfoForSymbol`. Rationale: correct on-chain units; fixes the zero-lamport sell.
- **Risk gate at the choke point:** call `canEnterPosition()` at the top of `executeSignal` for `action === 'buy'`, return `{ success:false, error:'Entry blocked by risk controls' }` when false. Rationale: every signal (chaos + strategy) flows through `executeSignal` via `submitOrders`; gating there covers both paths without scheduler changes. `recordTrade` already feeds the guards synchronously after each close, so the guards see accumulated loss before the next buy.
- **`BotEngine.start()` auto-select:** when `autoSelect` is true and pairs empty, invoke `onAutoSelect` (or a default rejection with the documented message) before throwing; add callback-presence validation. Rationale: aligns code with `bot-start-lifecycle` spec and the code's own comment ("Auto-select is a trigger… not a gate").
- **`changePassword` identity fix:** pass the existing `encrypted.publicKey` as the third argument to `encryptSeedPhrase` so the stored public key survives re-encryption.
- **Build/typecheck fixes are mechanical:** `StateTransition<TState>` generic in `state-machine.ts`; `Buffer.from(key)` (no hex decode) in `wallet-manager.ts:198`; type `plotColors`/`fillColorData` as `Record<string, (string | null)[]>` in `ChartComponent.tsx`.
- **Stale test updates:** chaos-realistic-engine (equity 10, qty 0.00002), jupiter-swap-adapter (assert `routePlan[0].swapInfo.ammKey`), solana-wallet (mainnet default), backend-services (new breach message), auto-select (add `totalPnlPercent` to mocks, drop `runParallel` case). Restore missing fixtures (alternating-long-strategy.pine, alert-sanity export.json).

## Risks / Trade-offs

- **Live money with real trades once fixed** → The fixes make chaos mode actually trade at correct 10% sizes on mainnet. Mitigated by the now-enforced risk gate and the user's explicit acceptance; user should still verify wallet funding before the run.
- **Broad file ownership in trading core** → One Backend Engineer owns all trading-core files to keep unit semantics consistent; frontend typecheck is file-disjoint and parallelized.
- **`canEnterPosition()` race with in-batch signals** → breach event is fire-and-forget, but `recordTrade` is synchronous inside `executeSignal` and signals are awaited sequentially, so subsequent buys in the same batch are blocked; subsequent sells (closes) still execute, which is desirable.
- **Prettier on 35 files** → mechanical auto-fix, run after code changes to avoid conflicts; each engineer formats files they own; Refactoring Engineer does the repo-wide pass and final gate verification.

## Migration Plan

No schema/DB migration. Deploy = commit; behavior activates on next backend restart / next `POST /api/bot/start`. Rollback = revert the commit. The persisted `bot-config.json` is untouched.

## Open Questions

- Whether `maxDailyWalletLossUsdc` should be added to the live config to enable the wallet-balance guard (currently intentionally absent) — deferrable; the daily/rolling guards are now enforced regardless.

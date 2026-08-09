## Why

Today PnL exists in 14 sites across 4 subsystems and cannot agree by construction: the backtest nets a pluggable commission (DEX bps + Jupiter tier + Solana network fee with a hardcoded $150 SOL price), while the live bot computes **gross** PnL and persists `fees: 0` because "no reliable fee source". Jupiter swap adapters drop the real fee data the aggregator returns (`routePlan[].swapInfo.feeAmount`, `platformFee`, echoed `prioritizationFeeLamports`), and two conflicting Jupiter fee-tier tables coexist. The Director demands the truth: one math implementation for PnL across live and backtest that counts every commission — blockchain and Jupiter-as-aggregator — with one canonical number.

## What Changes

- **New `src/pnl/` module** — the SINGLE math implementation: pure arithmetic over a canonical `FeeBreakdown` + fill stream. One `realizedPnl` identity used by BOTH live executor and backtest engine. No float, no per-site arithmetic.
- **`outAmount` anchor rule** — gross PnL is derived from actual executed values (`inAmount`/`outAmount` / fill prices). Venue fees + platform fee are ALREADY inside `outAmount`; they are **breakout-for-reporting only**, never subtracted again. Only SOL-side fees (priority, base, Jito) are subtracted.
- **Live fee capture** — Jupiter swap adapters parse the REAL response: per-routePlan-leg `feeAmount`/`feeMint`, `platformFee`, actual `prioritizationFeeLamports` echoed by `/swap`. Live closed trades persist REAL fees (fixes `fees: 0`; no fabricated 5bps).
- **Backtest fee model** — backtest feeds the SAME module via a tagged modeled input (`backtestFeeModel: "constant-tier" | "flat-bps" | "quote"`), replacing the hardcoded $150 SOL price with a configurable model price. Same math, different fee inputs.
- **Single fee-tier table** — consolidate the two conflicting JUPITER fee tables into ONE canonical source.
- **Aligned `netPnl` semantics** — the three stats aggregators (backtest metrics, trade-history `computeStats`, backend `buildGlobalPnlSnapshot`) consume the module's `RealizedPnl.net` so `net == gross - fees` everywhere.
- **Fee completeness honesty** — trades whose on-chain fee is unknown are flagged `feesUnknown`, NEVER presented as zero truth.
- **Trade-history compatibility** (**BREAKING** for clients reading `fees`/`realizedPnl`): `realizedPnl` becomes NET by default with explicit `grossPnl`/`fees` fields; existing `fee:0` rows are NOT retroactively mutated (backfill is out of scope).
- **Contract/parity test** — a permanent suite proving live-style and backtest-style inputs through the module give identical math, plus the identity `net === gross − totalFees`.

## Capabilities

### New Capabilities
- `pnl-calculation`: single encapsulated PnL & fee math — `realizedPnl`, `grossPnl`, `feeTotal`, `netPnl`, fee-dedup identity (`the outAmount anchor`), fee provenance (`observed` vs `modeled`), decimal-string invariant, and the live/backtest parity property.

### Modified Capabilities
- `jupiter-swap-adapter`: requirements change so the adapter SHALL capture real per-leg venue fees, platform fee, and actual priority-fee lamports from Jupiter responses into the canonical `FeeBreakdown` (instead of returning fabricated/zero fees).
- `trade-history`: requirement change — persisted closed trades SHALL carry real `grossPnl`, `fees` (fee breakdown), `netPnl`, and a `feesUnknown` marker when the on-chain fee is not observable; `realizedPnl` becomes the **net** value.
- `strategy-backtest-engine`: requirement change — backtest PnL SHALL be computed by the shared `pnl-calculation` module from a tagged modeled fee input (replacing the internal commission calculators and hardcoded SOL price).
- `trading-stats-dashboard`: requirement change — displayed and aggregated PnL is net-of-all-fees and consistent between dashboard, history API, and Telegram snapshot (single `RealizedPnl.net` source).

## Impact

- **New module**: `src/pnl/` (`types.ts`, `core.ts`, `aggregate.ts`, `fees.ts`, `index.ts`) — zero imports from `src/trading/`, `src/strategy/`, or `backend/`.
- **Rewired**: `src/trading/dex/jupiter-swap-adapter.ts`, `src/trading/dex/jupiter-ultra-adapter.ts`, `src/trading/live-strategy-executor.ts` (realize fees + persist), `src/strategy/strategy-engine.ts` (backtest consume module), `src/strategy/commission-methods/*` (delete or delegate to module), `src/trading/trade-history-store.ts`, `backend/src/services/globalPnl.ts`, `backend/src/backtest-runner.ts`.
- **Consolidated**: the two JUPITER fee-tier tables → a single table in `src/pnl/`.
- **Tests added**: `src/pnl/__contract__.spec.ts` (parity + identity + fixed fixtures), updated adapter/backtest/stats tests. The contract test file is a merge-gate.
- **Dependencies**: no new runtime deps (raw REST already in use); `@jup-ag/api` typings optionally referenced, with a local `SwapInfo` extension for `feeAmount`/`feeMint` (official typings omit them).
- **UI**: frontend trade dashboard shows net PnL consistently (coordinated with `trading-stats-dashboard` capability).

## Non-goals

- No retrofit/migration of historical `fee:0` rows (own change).
- No Jupiter SDK replacement (only the needed type extension).
- No redesign of the live executor / backtest engine beyond the seams.
- No oracle/price-feed architecture (only a `PriceMap` contract + configurable SOL price default).
- No stats-view redesign beyond aligning the three aggregators onto one `net` definition.
## Context

See proposal.md — Why. The codebase computes PnL in 14 sites across 4 subsystems: the backtest engine nets a pluggable commission (DEX bps + Jupiter tier + network fee with hardcoded `$150` SOL), the live executor computes **gross** PnL and persists `fees: 0`, Jupiter adapters drop the aggregator's real fee data (`routePlan[].swapInfo.feeAmount`, `platformFee`, echoed `prioritizationFeeLamports`), and two conflicting Jupiter fee-tier tables coexist. Wise Old Man review confirmed the architecture and added 4 binding corrections: (1) the `outAmount` anchor rule, (2) 3-layer module (core/aggregate/fees), (3) single mint→USD boundary, (4) slippage as memo. Backend Lead sequenced the change module-first.

## Goals / Non-Goals

**Goals:**
- One pure arithmetic module (`src/pnl/`) that computes gross, fees, and net for BOTH live and backtest.
- Live adapters capture real fee components from Jupiter responses (per-leg venue fee, platform fee, actual priority fee, base).
- Backtest feeds the same module from a tagged, configurable fee model (replacing hardcoded SOL price and internal calculators).
- Single canonical Jupiter fee-tier table; three stats aggregators align on one `netPnl` identity.
- Permanent contract test that makes divergence-by-construction impossible.

**Non-Goals:**
- Retrofit/migrate historical `fee: 0` rows (separate change).
- Replace the Jupiter SDK / switch from raw REST (only the `SwapInfo` type extension for `feeAmount`/`feeMint`).
- Redesign the live executor or backtest engine beyond the seams.
- Oracle/price-feed infrastructure (only a `PriceMap` contract + configurable model price).

## Decisions

**D1 — `src/pnl/` is pure and dependency-free.** Zero imports from `src/trading/`, `src/strategy/`, or `backend/`. Files: `types.ts` (canonical types), `core.ts` (pure arithmetic: grossPnl, feeTotal, netPnl), `aggregate.ts` (the ONE shared runner `aggregateRealizedPnl(fills, feeSource, prices)`), `fees.ts` (mint→quote boundary + backtest fee model generator), `index.ts`. *Rationale:* no imports ⇒ no cycle risk, no adapter types leak into math. *Alternative rejected:* putting math in `commission-methods/` — that is backtest-specific and would entrench the split.

**D2 — The `outAmount` anchor rule is a hard invariant, not a comment.** Gross PnL derives from actual executed values (fill prices / `inAmount`→`outAmount`). Venue + platform fee components are breakout-for-reporting ONLY — never subtracted from an `outAmount`-anchored gross (they are already inside it). Only SOL-side fees (PRIORITY, BASE, JITO) are subtracted. Enforced by contract tests F4 (breakout components never change net).

**D3 — Decimal strings everywhere, zero floats.** All arithmetic on scaled integer decimal strings (`DecimalStr`); no `number` in the module's math. Lamports/atomic amounts are integers. *Rationale:* fee + PnL money math must not accumulate IEEE754 drift (the repo already has an `ieee754-arithmetic` capability spec — same doctrine).

**D4 — Single mint→USD boundary: `feeToQuote`.** All fee components arrive in native/atomic units (`feeAmount` in the swapped token, SOL fees in lamports). One function converts them to quote using the SAME price basis as the execution (executed price live / model price backtest). USD is a report-layer destination applied last. A contract test greps that no other code multiplies/divides by price for fees.

**D5 — Fee provenance is metadata, not arithmetic.** `FeeSource { observed?: boolean; backtestFeeModel?: 'constant-tier'|'flat-bps'|'quote' }` rides on `RealizedPnl` but never changes math. Live → `observed`; backtest → `modeled` + tag. Trades with unobservable fees get `feesUnknown: true` and never a fabricated zero.

**D6 — One canonical fee-tier table.** The module owns the single table (replacing `commission-methods/utils.ts` `JUPITER_FEE_BPS` AND the live ultra adapter's flat-5bps). The live adapter's tier comes from the same source. The dead table is DELETED in the same commit as the module lands.

**D7 — Three aggregators consume `RealizedPnl.net`.** `strategy-metrics.computeMetrics`, `trade-history-store.computeStats`, and `backend globalPnl.buildGlobalPnlSnapshot` all fold `net == gross − fees` from module output. No re-derivation.

**D8 — Backtest fee model is config + tag.** `BacktestFeeModel { tag, venueBps?, platformBps?, priorityLamports?, baseLamports=5000, solUsdPrice }`. Replaces hardcoded `$150`. The default price is a configurable constant (current market value at deploy time), NOT an oracle.

## Risks / Trade-offs

- [Live double-counting: subtracting venue/platform fees from an outAmount-anchored gross] → Anchor rule in core + contract test F4; the module documents which fees are inside outAmount.
- [Lamports↔USD mixing across live/backtest (hardcoded $150 drift)] → `feeToQuote` single boundary + same-price-basis invariant + contract grep gate + model owns `solUsdPrice` explicitly.
- [Two fee-tier tables drift further / one gets re-wired later] → Delete the dead table in the same commit the module lands.
- [Frontend PnL numbers change from gross→net (user-visible)] → Coordinated `trading-stats-dashboard` capability; frontend tests updated in the same change; explicit UI commit.
- [Priority fee volatility makes live fee estimates noisy] → Always read the actual echoed `prioritizationFeeLamports`, never predict; fallback is `feesUnknown`, not an invented number.
- [Historical `fees: 0` rows mislead after the change] → Out of scope for this change; records flagged `feesUnknown` going forward; backfill requires a Director decision.
- [Backtest fee model is a guess, not the on-chain truth] → Model is tagged per run (`backtestFeeModel`), so results are comparable; the tag makes the assumption auditable.

## Migration Plan

1. Land `src/pnl/` module + contract tests (greenfield, zero consumers — no blast radius).
2. Wire live adapters (fee capture) → live executor (real fees persisted).
3. Wire backtest engine to the module's modeled inputs; delete legacy `commission-methods/` calculators + dead tier table.
4. Align the 3 aggregators; update API/frontend contracts (net semantics).
5. Merge gate runs the contract suite; existing affected tests updated by Test Engineer only.
6. Rollback: the module is additive; if a wiring step regresses, revert that step's commit — the module itself stays.

## Open Questions

- None that change specs/approach. Historical fee backfill (M10) is deferred and requires a Director decision when real fee-carrying history exists.
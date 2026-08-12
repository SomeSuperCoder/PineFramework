## Context

Three callers invoke the shared `runBacktestPipeline` engine
(`backend/src/backtest-runner.ts`): the `pnpm backtest` CLI, the frontend's
`POST /api/backtest` HTTP route, and the auto-select `LiveBacktestRunner`. The
engine and `computeBacktestMetrics` are already single-sourced. The duplication is
in the surrounding glue — mapping the caller's input into a `StrategyConfig`
override, fetching DEX fees, and mapping engine output into each caller's result
shape. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- One module for config override + DEX-fee application (`backtest-config.ts`).
- One module for result mapping (`backtest-result.ts`), carrying RAW engine output
  and producing each caller's shape via a dedicated mapper.
- Three callers become thin wrappers; engine internals untouched.

**Non-Goals:** engine/metrics changes; changing any external contract; changing DEX
fee semantics per caller; removing the CLI guard.

## Decisions

**D1 — Keep result mappers separate, share the raw computation.**
`BacktestOutcome` holds unsanitized engine output (from `computeBacktestMetrics`).
Each caller gets its own mapper (`toApiResult`, `toCliSymbolResult`,
`toAutoSelectMetrics`). Rationale: the route and CLI have *intentionally
different* sanitizers — route `Number.isFinite(v) ? v : (v === Infinity ? null : 0)`,
CLI `Number.isFinite(v) ? v : 0`. A shared sanitizer would silently change one
caller's contract. Alternatives considered (single shared sanitizer) rejected as
contract-breaking.

**D2 — `buildBacktestConfigOverride` copies only PRESENT canonical keys.**
Canonical set = the route's current field list. It reads keys off the caller's
input object and omits `undefined`. This makes the CLI's current no-op behavior
stable: `CliOptions` has no `slippageType`/`marginLong`/etc., so they never appear,
and the engine applies its own defaults exactly as before. No numeric CLI change.

**D3 — `applyDexFee` is the single DEX-fee fetch; failure mode is an option.**
`applyDexFee(symbol, override, { onFailure: 'throw' | 'fallback',
fallbackCommission? })`. Route/CLI pass `throw`; auto-select passes
`fallback` with `0.1`. The "needs fee" predicate is the resolved
`commissionMethod` (jupiter_manual/jupiter_ultra), not a dex-kind — auto-select
maps its dex to `jupiter_ultra` before calling, keeping one predicate.

**D4 — The `allowUnrealisticResults` guard stays CLI-only.**
It lives in `backtest-cli.ts validateOptions` (pre-run), not runtime. Exported as
`assertRealisticCommissionMethod(method, allowNonJupiter)` and called only from the
CLI's `validateOptions`. Route/auto-select never call it (matching today).

**D5 — Capture golden fixtures BEFORE rewiring.**
`backend/tests/fixtures/backtest-*.golden.json` snapshot the CURRENT route
`job.result` and CLI `SymbolMetrics` via a deterministic backtest. Parity tests
deep-equal the new mappers against these fixtures, proving no contract drift.

## Risks / Trade-offs

- [Risk] Mapper drift breaks the frontend API. → Mitigation: golden-fixture
  deep-equal parity tests (D5) + Code Reviewer on parity exactness.
- [Risk] CLI `SymbolMetrics` asymmetry missed (only 4 of 8 fields sanitized). →
  Mitigation: `toCliSymbolResult` reproduces that exact asymmetry; covered by the
  CLI golden fixture.
- [Risk] `applyDexFee` blurrs failure modes. → Mitigation: failure mode is an
  explicit option; auto-select's 0.1% fallback preserved verbatim.
- [Risk] Spurious config injection into the CLI. → Mitigation: copy-only-present
  (D2); reviewer confirms CLI path passes real `CliOptions`.

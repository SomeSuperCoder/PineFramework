# Design — multi-world-portfolio-trading

## Context

Current state (scouted):
- `src/trading/auto-select.ts` — `AutoMarketSelector.select()` runs candidates in a sequential `for` loop (fetchBars → runBacktest each). Sorts by metric, takes `evaluations[0]` as `best`. No PnL>0 filter.
- `backend/src/routes/bot.ts:494` — completion handler hardcodes `pairs: [result.best.pair], autoSelect:false`, persists to `bot-config.json`. Backend start gate exists at `bot-engine.start()` (throws on empty selection).
- `LiveDashboard.tsx:682` — wizard advances `'backtest'→'review'` on any `autoSelectResult`; this is the frontend progression gate.
- `LiveStrategyExecutor.strategyStates` — Map keyed `${symbol}:${timeframe}`; BybitWebsocket supports multi-subscribe; scheduler has per-pair error isolation. BUT: one global engine singleton (`getEngine()`), one `strategySource`, dashboard assumes `pairs[0]`, order submission globally mutexed around one wallet.
- Persistence: `<dataDir>/strategy-state.json` (flat), `bot-config.json`, `wallet.enc`.
- Sizing seam: `live-strategy-executor.ts:733` `positionFraction = signal.sizeFraction ?? positionSizePercent/100`. Balance via `fetchUsdcBalance():1119` → `dex.getBalance(...)`; ⚠️ JupiterUltraAdapter's getBalance is a stub returning '0'.
- Backtest jobs: in-memory `Map<string, BacktestJob>` (`routes/backtest.ts:77`); metrics via `runBacktestPipeline`/`computeBacktestMetrics` (`backend/src/backtest-runner.ts`); PnL is NET quote units.
- UI: Tailwind + shadcn/ui + `--color-*` tokens; `AutoSelectGrid.tsx` scroll container lacks auto-scroll (reuse log-panel scrollTop pattern, LiveDashboard:328–333).

## Decisions

### D1 — Top-N gate lives in `AutoMarketSelector.select`
PnL>0 hard filter applied BEFORE top-N truncation. Zero-positive → typed result `{ blocked: true }` (no throw) so the API can return a structured payload and the UI renders the block state. `bot.ts` completion handler consumes it: persists `worlds: [...topN]` instead of `pairs: [best]`.

### D2 — Concurrency: p-limit (~4), no worker threads
Fetch+backtest per candidate wrapped in p-limit. Fetch is I/O-bound (the real win); backtest compute is CPU-bound JS where worker_threads add overhead for marginal gain. Limit configurable constant, not user-facing initially.

### D3 — Multi-world: ONE engine, N keyed executor states
Extend the existing `${symbol}:${timeframe}` keying to world keys `${symbol}:${timeframe}:${strategyId}`. Per-world order mutexes replace/augment the global wallet mutex. NOT N engine instances — singleton lifecycle, config plumbing, and shutdown stay single-sourced.

### D4 — Config migration
`bot-config.json` v2 with `worlds: [{timeframe, symbol, strategy}]`; legacy `{pairs:[x]}` migrates to 1-world on load. `strategy-state.json` gets `schemaVersion: 2`; loader recovers legacy flat entries into world keys. Positions are never silently dropped.

### D5 — CapitalAllocator (DI)
New module computing PnL-weighted USDC splits (largest-remainder rounding, dust to largest weight). Injected into executor at the composition root; sizing seam uses per-world allocated capital instead of global balance fraction.

### D6 — ⚠️ OPEN: balance source (ESCALATED)
JupiterUltraAdapter.getBalance returns '0' stub. Real capital math cannot trust it. Options: (a) wire a real balance source, or (b) allocate the user-configured capital figure only (capital is an explicit input, allocation math never reads live balance). Default until Director answers: **(b)** — safer, deterministic.

### D7 — Wizard restructure (frontend)
Steps: strategies(multi-select) → backtest-all(progress grid, bounded concurrency display, auto-scroll) → world-ranking(PnL-sorted, N picker) → capital-allocation panel → review. Gate at backtest step: zero-positive blocks with "go back and pick another strategy" CTA. New components: StrategyMultiSelect, WorldRankingPanel, CapitalAllocationPanel; rework SetupWizard steps array + AutoSelectGrid (tokens + auto-scroll); keep useAutoSelectProgress WS plumbing (extend payload shape). Extract shared subcomponents rather than breaking AutoSelectGrid props used by BotMetrics/BotControls.

## Risks

- R1: AutoSelectGrid shared surface → prop-breakage ripple (mitigated by subcomponent extraction).
- R2: strategy-state migration corrupting live positions → migration tests with legacy fixtures mandatory before any live run.
- R3: parallel backtests skew shared in-memory job map ordering → results keyed by candidate id, ranking applied post-collection.
- R4: balance stub (D6).

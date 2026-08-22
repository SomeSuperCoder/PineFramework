## Why

The bot currently auto-selects a single best pair, backtests sequentially, and live-trades one `world` (timeframe+symbol+strategy) at a time. This wastes wall-clock time during backtests and concentrates all trading capital on one combination. The Director wants a portfolio-style system: many worlds traded simultaneously, capital split by PnL weights, and a professional selection UX.

## What Changes

- **Auto-select top-N**: `AutoMarketSelector.select` picks the user-configured N best pairs instead of 1. HARD filter: worlds with non-positive PnL are never selected, even if fewer than N result. If zero positive-PnL worlds exist across all backtests → progression to the next wizard step is BLOCKED with a "go back and pick another strategy" offer.
- **Parallel backtests**: candidate fetch+backtest runs run concurrently via p-limit (bounded, ~3–4) replacing the sequential for-loop in `src/trading/auto-select.ts`.
- **Multi-world live trading**: bot config accepts a world list (`tf1+sym1+stg1, tf1+sym2+stg2, ...`). One engine, N per-world keyed executor states (extending the existing `${symbol}:${timeframe}` Map), per-world order mutexes. **BREAKING**: `bot-config.json` gains a `worlds` list (v2); legacy single-pair configs migrate to 1-world. `strategy-state.json` gets `schemaVersion: 2` with legacy-key recovery — positions are never silently dropped.
- **PnL-weighted capital distribution**: USDC capital split across selected worlds proportional to PnL weights (e.g. +2/+3/+5% → 4/6/10 of 20 USDC). Injected at the `positionFraction` seam (`live-strategy-executor.ts:733`) via a new `CapitalAllocator`.
- **UI/UX rework**: wizard becomes strategies(multi-select) → backtest-all(progress grid w/ bounded concurrency + auto-scroll) → world ranking(PnL-sorted, top-N picker) → capital allocation panel → review. Auto-backtester grid restyled with design tokens, auto-scroll to active symbol.

## Capabilities

### New Capabilities
- `multi-world-selection`: top-N auto-select with PnL>0 hard filter, zero-positive progression block, parallel bounded backtests.
- `world-capital-allocation`: PnL-weighted USDC capital distribution across selected worlds.

### Modified Capabilities
- (none — no existing spec files under `openspec/specs/` cover these behaviors)

## Impact

- `src/trading/auto-select.ts`, `backend/src/routes/bot.ts`, `backend/src/routes/backtest.ts`
- `src/trading/{bot-engine,live-strategy-executor,scheduler,config-store}.ts`
- `bot-config.json` / `strategy-state.json` schema + migration
- Frontend: `LiveDashboard.tsx` SetupWizard, `AutoSelectGrid.tsx`, `useAutoSelectProgress.ts`; new StrategyMultiSelect / WorldRankingPanel / CapitalAllocationPanel components
- ⚠️ Open decision: JupiterUltraAdapter.getBalance is a stub returning '0' — real balance source must be resolved before live capital math.

## Non-goals

- No changes to strategy logic itself or indicator computation.
- No new exchanges; no changes to order execution internals beyond per-world concurrency.
- No cross-exchange or cross-wallet capital management.

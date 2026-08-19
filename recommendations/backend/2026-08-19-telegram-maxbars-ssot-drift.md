# Telegram backtest producer: MAX_BARS SSOT drift + missing timeframe forwarding
**Date:** 2026-08-19
**Source:** backend-engineer (A2 max-bars handoff)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
`backend/src/telegram/backtest/runTelegramBacktest.ts:105` still has its OWN `MAX_BARS = 1500` pre-validation literal (its comment already flags this as drift) and does NOT forward `params.timeframe` to the engine. Update it to accept `maxBars` (configurable) and forward the timeframe to `new ExecutionEngine(..., { timeframe })`, matching the CLI path fixed in the engine-fix change.

## Rationale
SSOT violation: the 1500-bar cap now lives in two places (CLI runner + telegram producer). Telegram-driven backtests of 1m/5m strategies will still hit the 1500-bar cap and run without timeframe context — same class of defect just fixed for the CLI, silently still broken for the telegram surface.

## Evidence
- `backend/src/telegram/backtest/runTelegramBacktest.ts:105` — literal `MAX_BARS = 1500`
- Engine fix change: `backtest-runner.ts` now `options.maxBars ?? 1500` + `ExecutionEngine(..., { timeframe })`

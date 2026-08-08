# Route console.log → logger
**Date:** 2026-08-08
**Source:** QA Engineer (qualityStrategySelector)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
`backend/src/routes/backtest.ts:239` (`console.log('[backtest] POST received: ...')`) and lines ~259/329 should use the `logger` the route already imports instead of stdout debug logging.

## Rationale
Console debug output pollutes server stdout and bypasses the structured logging setup; production diagnostics should go through `logger.*` for filterability.

## Evidence
QA swept changed files for debug leftovers; `backtest.ts:239` is a stdout log on every POST (pre-existing, informational).
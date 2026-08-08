## Why

After the UI/UX rework the backtest button/panel is always visible on the sidebar (this is desired and stays). But the chart is no longer the source of truth for which strategy to backtest — `App.tsx` still sends `script: strategySource`, which is derived from chart-execution markers and now resolves to `''`. Every backtest fails with `Backtest failed: No Pine Script source provided. Set "script" in the request body.` The panel must ask the user explicitly.

## What Changes

- **Frontend**: The backtest panel SHALL present a strategy dropdown. The user picks the strategy; the selected strategy's Pine `source` is sent as `script` in the backtest request — no chart dependency.
- **Frontend**: Remove the chart-derived `strategySource` seam in `App.tsx` — the chart no longer feeds the backtest flow.
- **Frontend**: Run backtest is prevented until a strategy is selected (disabled state + visible validation), so an empty `script` cannot be sent from this panel.
- **Frontend**: Decommission the legacy `BacktestSettingsPopup` — it is a 1:1 duplicate of the now-always-visible panel and ships the same bug. Its entry point ("Open settings" from results) instead navigates to the panel.
- **Frontend**: Polish the panel UI/UX per `CONTROL-PANEL-DESIGN.md` §5.3 config bar `[Select Strategy ▾] [Symbol] [Timeframe] [Date Range] [Run Backtest ▼]` — loading/empty/disabled states, error surfacing, design tokens, accessible combobox.
- **Backend**: `POST /api/backtest` SHALL validate `script` at request time (immediate `400 { error }`, matching the existing `symbol`/`timeframe` validation style) instead of failing asynchronously after a market-data fetch.

## Capabilities

### New Capabilities

- _(none — no new capability introduced; reuse existing selector and scripts APIs.)_

### Modified Capabilities

- `strategy-backtest-engine`: add a requirement that the backtest API SHALL reject a request without a `script` at request time with a `400` (previously only checked asynchronously inside the job).
- `frontend-application`: add a requirement that the BacktestPanel SHALL allow the user to select a strategy via dropdown and SHALL send the selected strategy's source as the backtest `script`; backtest must not be submitted without a selection.

## Impact

- **Frontend**: `App.tsx` (seam, popup state, `handleRunBacktest`), `BacktestPanel.tsx`, `StrategySelector.tsx` (additive optional props only), `StrategyResultsPopup.tsx` (settings action → panel nav), delete `BacktestSettingsPopup.tsx`.
- **Backend**: `backend/src/routes/backtest.ts` — one request-time guard (~4 lines); async guard stays as defense-in-depth.
- **Tests**: `frontend/src/__tests__/backtest-flow.test.tsx` updated (assert POST body carries `script`); new backend route test (`POST /backtest` without `script` → 400); delete `BacktestSettingsPopup.test.tsx`.
- **APIs**: `POST /api/backtest` contract — `script` was already de-facto required; now invalid requests fail fast with a `400` instead of an async failed job.
- **No new dependencies.**

## Non-goals

- No redesign of the sidebar / whole panel visual identity (bounded polish only).
- No new backend strategy-list endpoint (existing `GET /api/scripts` + `/api/scripts/built-in` suffice).
- No changes to `TradingBotPanel` or its use of `StrategySelector`.
- No changes to chart-driven strategy execution.
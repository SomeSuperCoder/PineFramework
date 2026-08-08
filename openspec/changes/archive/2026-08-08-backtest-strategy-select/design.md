## Context

The backtest flow was previously gated on a strategy running on the chart: `App.tsx` derived `strategySource` from chart-execution markers and injected it into `POST /api/backtest` as `script`. After the sidebar rework (commits `1d1a4cb`, `2dc7362`) the backtest button is always visible, the chart no longer executes strategies, so `strategySource` resolves to `''` → the backend job fails with `No Pine Script source provided. Set "script" in the request body.` (`backend/src/routes/backtest.ts:95-98`).

The chart is no longer the source of truth for what strategy to backtest. The panel must own the selection. Constraints: `CONTROL-PANEL-DESIGN.md §5.3` fixes the panel's config bar; a reusable, battle-tested `StrategySelector` already exists; strategies are listed via `GET /api/scripts` + `GET /api/scripts/built-in` (source included); the backend validates `script` only asynchronously today.

## Goals / Non-Goals

**Goals:**
- User selects the strategy in the backtest panel via dropdown; the selected strategy's `source` is sent as `script` — chart-independent.
- Failed fast backend contract — `POST /api/backtest` without a usable `script` returns `400` immediately.
- Bounded UI/UX polish per the frozen design spec (§5.3) + functional states.
- Remove dead duplicated surfaces (`BacktestSettingsPopup`, chart-derived `strategySource`).

**Non-Goals:**
- No sidebar redesign, no new backend list endpoint, no `TradingBotPanel` changes, no build of a new selector primitive from scratch.

## Decisions

### D1 — Reuse and adapt `StrategySelector` (not extract, not build new)
`StrategySelector.tsx` already fetches `/api/scripts` + `/api/scripts/built-in`, filters strategy type, returns `{id, name, source, type, isBuiltIn}`, and provides search/combobox UX. Add **optional additive props** (`label?`, `placeholder?`, `height?`) with current defaults so `TradingBotPanel` (sole existing caller) is untouched.
*Alternatives:* build a new select (rejected: duplicates tested logic) · extract a shared primitive (rejected: indirection for 2 callers).

### D2 — Panel owns the script; `handleRunBacktest` guards empty selection
`BacktestPanel` holds `selectedStrategy` state. `handleRunBacktest` (App.tsx:343-350) gains the selected strategy and:
- if no strategy selected → surface "Select a strategy to backtest." and **do not** submit;
- else submit `{ ...config, script: selected.source }`.
The chart-derived `strategySource` block (App.tsx:320-335) is deleted — the chart is no longer a backtest input.

### D3 — Decommission `BacktestSettingsPopup`
It is a 1:1 duplicate of the panel (same settings UI, same `handleRunBacktest`, same broken `script`). With the panel always visible on the sidebar, the legacy modal is redundant. Its single entry point — "Open settings" from `StrategyResultsPopup` — switches to navigating the user to the backtest panel. Reversible from git; keeps `App.tsx` free of a second broken seam.

### D4 — Backend early `400` for missing `script` (4-line gate)
Add the check inline with the existing request validation in `POST /backtest` (after the timeframe guard), **not** a new validation framework:
`if (!script || typeof script !== 'string') → 400 { error: 'Missing or invalid "script" field' }`.
The async guard in `runBacktest` (backtest.ts:95-98) stays as defense-in-depth for non-HTTP callers. Behavior for valid requests is unchanged.

### D5 — Validation by unit/route test, not ceremony
Backend: route test `POST /backtest` without `script` → `400` + no job created (first route test for this endpoint). Frontend: update `backtest-flow.test.tsx` to assert the POST body carries the selected strategy's `script`, and that run is blocked with no selection (mock strategy API; no real POSTs). Delete `BacktestSettingsPopup.test.tsx` with the component.

### D6 — Polish bounded to the frozen spec
Polish pass per `CONTROL-PANEL-DESIGN.md §5.3`: config bar `[Select Strategy ▾] [Symbol] [Timeframe] [Date Range] [Run Backtest ▼]`, design tokens (no new hardcoded hex), loading/empty states for the dropdown, disabled Run until valid, error surfacing on the panel (validation + poll-timed), accessible combobox (label, `aria-expanded`, keyboard, focus-visible). No motion work, no redesign.

## Risks / Trade-offs

- **`StrategySelector` coupling to `TradingBotPanel`** — we only add optional props; behavior stays → Trade-off accepted; a later extraction is possible when a 3rd caller appears.
- **Decommissioning the popup affects `StrategyResultsPopup`** → its settings action re-routes to the panel; covered by updated `backtest-flow.test.tsx`.
- **Very large Pine scripts near Express's default 100kb body limit → `413`** → mitigation: verify `express.json({ limit })` config at implementation time; normal scripts are far below.
- **Race if user switches strategy mid-run** → mitigation: disable Run while a job is in flight (part of polished states).
- **Regressions on `TradingBotPanel`'s selector** → mitigation: additive-props only + existing panel tests must stay green.

## Migration Plan

1. Backend gate + route test (independent, parallel with frontend).
2. Frontend functional: selector props → panel dropdown → `handleRunBacktest` seam → decommission legacy path.
3. Frontend polish per DESIGN §5.3.
4. Test updates + QA gate → commit at feature boundary (single commit `feat(backtest): strategy dropdown + panel polish`).

Rollback: reverts to chart-derived `strategySource` behavior; the early `400` is a strict guard (invalid requests only), reversible by restoring the old gate.
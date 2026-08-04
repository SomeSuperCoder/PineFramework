## Context

The mini chart's `activePair` is derived from `LiveDashboard.persistedConfig` (`frontend/src/components/TradingBotPanel.tsx:2232`), which is refreshed in only four places: mount fetch, the Idle/Stopped transition, config reset, and `onBacktestStarted` (auto-select only). The manual backtest flow persists the selected pair to the backend (`POST /api/bot/configure` with `pairs: [manualPair]`) but never refreshes the frontend `persistedConfig`, so `activePair` is null when the bot first reaches Running and `LiveBotView` returns null. See proposal.md for the full trace.

## Goals / Non-Goals

**Goals:**
- The mini chart appears on the first start after manual pair selection.
- The frontend's `persistedConfig` reflects the backend's persisted config (the SSOT) whenever the bot reaches a running state.

**Non-Goals:**
- No backend changes — the backend already persists the manual pair.
- No changes to MiniChart rendering or the data pipeline hook.

## Decisions

### D1: Re-fetch persisted config on Starting/Running transition
In `LiveDashboard`, extend the existing config-refresh effect (currently scoped to `Idle`/`Stopped`, TradingBotPanel.tsx:1914) to also re-fetch `/api/bot/config` when `status.state` becomes `Starting` or `Running`. This guarantees `persistedConfig.pairs` holds the resolved pair — manual or auto — before `LiveBotView` mounts.

- **Rationale**: The backend config is the single source of truth for the active pair. Refreshing at the transition covers every start path (manual, auto, restart) and fixes the latent auto-mode timing issue where `onBacktestStarted` fires before the async backtest resolves pairs (bot.ts:365).
- **Alternative considered**: Push the pair up from `SetupWizard` via a callback. Rejected because it duplicates the pair (local `manualPair`/`autoSelectResult` state) instead of deriving from the backend SSOT, and misses the auto-mode case.
- **Alternative considered**: Only call `onBacktestStarted` in the manual handler. Rejected as narrower — it wouldn't cover the auto-mode timing gap and ties the fix to a specific click path.

### D2: Refresh config after manual pair persistence
In `SetupWizard`'s manual "Next" handler, after the configure POST succeeds, re-fetch `/api/bot/config` so the review → start transition already has a resolved pair (no race with D1's transition-triggered fetch).

- **Rationale**: Mirrors the existing `onBacktestStarted` pattern and removes the small window where a Running transition could theoretically render before the fetch completes. D1 is the guarantee; D2 is a belt-and-suspenders refinement.

## Risks / Trade-offs

- [Extra fetch on every start] → Adds one `GET /api/bot/config` per start transition; negligible, and the endpoint is already called on Idle/Stopped transitions.
- [Stale pair if fetch races the state transition] → D2 (refresh at pair-persistence time) ensures the config is current before the user even clicks Start; D1 is a second, ordering-independent safety net.
- [Auto-select pair still resolving when bot starts] → `bot-start-lifecycle` already prevents starting without resolved pairs, so by the time status is Running the backend config is valid.

## Migration Plan

Pure frontend fix; no data migration or rollback steps beyond reverting the commit.

## Open Questions

None.

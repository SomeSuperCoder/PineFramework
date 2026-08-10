## Context

The backtest start panel (`BacktestPanel.tsx`) is a React 18 + Vite + Tailwind v4 + shadcn form with local `useState` + localStorage persistence (`pine-backtest-settings`). The strategy dropdown (`StrategySelector.tsx`) fetches through a hardcoded absolute `http://${hostname}:8081` while the backend binds 127.0.0.1 only — proven root cause of "dropdown doesn't work" (Bug Hunter report). Timeframe/pair currently live in the App header and are passed in as props. The TelegramConfigPanel sets the "professional look" bar (Card shell, SectionHeaders, SettingRows, StatusCallout, h-10 controls, aria everywhere) with one state hook (`useTelegramSettings`). A backend Jupiter fee fetcher exists (`fetchDexFeeBps` → `FeeFetchResult`) but is only invoked server-side inside `POST /api/backtest` and never shown in the UI. See proposal.md — Why.

## Goals / Non-Goals

**Goals:**
- Fix the strategy dropdown (relative fetch + refetch-on-open) — spec `frontend-application`.
- Panel owns ALL input values as independent state, decoupled from the App header — spec `frontend-application` + `manual-select-dropdowns`.
- Guardrails on both date-range modes from the existing `candleLimit.ts` machinery — spec `strategy-backtest-engine`.
- Professional visual renovation to the TelegramConfigPanel bar — spec `frontend-application` (styling requirement).
- Feature-gated sample-fees display via a new lightweight endpoint — spec `backtest-sample-fees-prefetch`.
- Deprecate manual dexFeeBps/solPriceUsd advanced settings — spec `backtest-sample-fees-prefetch`.

**Non-Goals:**
- No changes to App header live-trading symbol/timeframe behavior (only the backtest prop wiring changes).
- No container wiring fix (compose port mapping / nginx `/api` proxy) — recorded as a recommendation, not in this change.
- No i18n, no animations, no design-system token overhaul beyond what the panel needs.
- No refactor of `fetchDexFeeBps` itself (6 callers, no tests — leave as-is).

## Decisions

### D1. One `useBacktestPanelState` hook (mirror `useTelegramSettings`)
All panel state (strategy, initialCapital, timeframe, symbol, dateRangeMode/daysBack/startDate/endDate, commissionMethod + settings) lives in one custom hook with typed setters, dirty/status flags where needed, and a single persistence path. Alternatives: per-component `useState` (scattered persistence, no single test surface), a global store (overkill for one panel). Rationale: the panel already centralizes state; the hook formalizes it, gives storage migration one home, and mirrors the proven Telegram pattern.

### D2. Panel owns symbol/timeframe; passed up at run time
The panel renders its own pair + timeframe dropdowns (curated option sets) and passes them to `handleRunBacktest` → `submitBacktest(symbol, timeframe, config, start, end)`. The App header state is untouched; the backtest POST payload already carries symbol/timeframe so zero backend change. No back-sync to the header (decoupling per requirement #4). Alternative considered: sharing header state — rejected, couples live trading to backtest and violates independence.

### D3. Storage: one key, extended + migrated
Keep `pine-backtest-settings` as the single key; add `timeframe`, `symbol`, keep existing fields; migration clamps out-of-bounds values (e.g. stale `daysBack` after timeframe change) on mount and seeds new fields from defaults. No new keys, no data loss.

### D4. Capability-probe gate for sample fees
Frontend probes `GET /api/backtest/dex-fee?symbol=...` on mount + on symbol change. HTTP 404 → render NO sample-fees card (graceful absence, zero error flash — the "if and only if" gate). 200 → show card with StatusCallout (dexFeeBps + source badge + dexLabel + solPriceUsd when present), CardSkeleton loading with `aria-busy`, destructive callout + retry on 503/network error. Render-on-fetch-success rejected (would flash errors when the feature is absent).

### D5. Endpoint contract: `GET /api/backtest/dex-fee?symbol=<SYMBOL>`
Validates symbol (required, trimmed, upper-cased; unmapped → 400), returns `FeeFetchResult` verbatim plus optional `solPriceUsd` from a NEW tiny SOL/USD fetcher (Jupiter price API or CoinGecko, disk-cache ~5–15 min TTL), 503 on total upstream failure, 404 reserved for feature-absent. No `commissionMethod` param — the DEX fetch is identical for both Jupiter methods (tier is a separate static table). Existing inline POST fetch stays as-is.

### D6. Professional visual renovation per TelegramConfigPanel recipe
Shell wrapper + stacked Cards (Strategy → General → Commission/SampleFees), icon SectionHeaders, hairline SettingRows, uniform `h-10`, StatusCallout, CardSkeleton, a11y. Fix raw-hex violations in `BacktestGeneralSettings.tsx:254` + `StrategySelector.tsx` and `height={36}`. Promote `SettingRow`/`StatusCallout`/`CardSkeleton`/`SectionHeader` to a shared location for reuse. Visual authority = archived design docs (DESIGN.md gone from disk).

### D7. StrategySelector bug fix folded into the redesign
Switch to relative `/api/scripts` + `/api/scripts/built-in` (QuickAdderPopup precedent); drop the `!error` open-gate so reopen retries. Reuse the component, do not fork.

## Risks / Trade-offs

- [`backtest-flow.test.tsx` breaks on `onRun` signature change] → Test Engineer updates wiring in Wave 3; flow assertions kept.
- [localStorage migration corrupts old settings] → unit-tested migration + clamp-on-mount; single key, extended not replaced.
- [Design System Engineer touches shared primitives used by TelegramConfigPanel] → import-compatible extraction, existing Telegram tests + `tsc` catch regressions.
- [Sample-fees card never shows because endpoint lands late] → 404 gate handles absence gracefully; backend work is a parallel lane, not a frontend blocker.
- [SOL price fetch adds a new external dependency] → tiny fetcher, cached, optional field; failure degrades to fee-only display (spec allows omitting solPriceUsd).
- [Removing advanced settings surprises users who set custom fees] → backend already overwrites dexFeeBps at run time (proven), so the inputs were cosmetic; new UI surfaces the autofetched value read-only.

## Migration Plan

1. Frontend: ship hook + storage migration + relative-fetch fix first (state refactor keeps behavior).
2. Frontend: redesign + deprecate advanced settings (visual change, no data shape change).
3. Backend: add `/api/backtest/dex-fee` endpoint (additive; existing routes untouched) → frontend SampleFeesCard lights up via probe.
4. Rollback: revert commits in reverse order; localStorage key unchanged so no user data loss; feature-absent deployments naturally show no card.

## Open Questions

None that change specs/approach. (Container wiring fix and "use current chart settings" quick-fill are optional follow-ups, not blockers.)

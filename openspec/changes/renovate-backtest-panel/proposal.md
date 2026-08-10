# Renovate Backtest Start Panel

## Why

The backtest start panel is functionally fragile and visually behind the professional bar already set by the Telegram bot settings panel: the strategy dropdown fails to load in most access modes (hardcoded absolute backend URL bypasses the proxy while the backend binds 127.0.0.1 only), the panel's input values are split between App-level props and local state, the date-range inputs lack consistent guardrails, and the "advanced settings" (manual dex swap fee + SOL price) are cosmetic — the backend already autofetches the DEX fee at run time and overwrites whatever the user typed. The sample Jupiter fees prefetch feature exists server-side but is invisible in the UI.

## What Changes

- **FIX** the strategy dropdown: `StrategySelector` fetches `/api/scripts` + `/api/scripts/built-in` via relative paths (QuickAdderPopup precedent) instead of the hardcoded absolute `http://${hostname}:8081`; re-fetch on reopen instead of freezing on a first-error.
- **Independent state**: all backtest panel values (strategy, initial capital $, timeframe, trading pair, date range, commission method) become state owned by the panel via one `useBacktestPanelState` hook (mirrors `useTelegramSettings`); App header live-trading selectors stay untouched; the run payload carries symbol/timeframe up at run time.
- **Guardrails** on date range: both modes (days-back and explicit range) validated against the existing 1500-candle backend limit (`candleLimit.ts`), clamp-on-change and clamp-on-mount for migrated stale values.
- **Professional UI**: renovated panel matches the TelegramConfigPanel recipe (Card shell, icon SectionHeaders, hairline SettingRows, uniform `h-10`, StatusCallout, CardSkeleton, aria everywhere, theme tokens — no raw hex).
- **Feature-gated sample fees display** (NEW capability): backend `GET /api/backtest/dex-fee?symbol=…` exposes the existing `fetchDexFeeBps` + a new tiny SOL/USD price fetcher as `{dexFeeBps, source, dexLabel?, solPriceUsd?}`; the panel shows the fetch result when the user selects a trading pair — **only if** the endpoint is implemented (404 → card hidden, graceful absence).
- **DEPRECATE** the advanced settings: remove manual `dexFeeBps`/`solPriceUsd` inputs; fees/SOL become a read-only autofetch result.

## Capabilities

### New Capabilities
- `backtest-sample-fees-prefetch`: exposes the Jupiter DEX fee + SOL price sample fetch via a lightweight endpoint; the backtest panel conditionally displays the fetched result on trading-pair selection, hiding entirely when the feature is absent.

### Modified Capabilities
- `manual-select-dropdowns`: the strategy selector must load strategies through the same-origin proxy (relative fetch) and recover on reopen rather than freezing after the first failed fetch.
- `frontend-application`: the backtest start panel owns all its input values as independent panel state (strategy, capital, timeframe, pair, date range, commission method); inputs get professional visual treatment consistent with the shadcn design system.
- `strategy-backtest-engine`: manual dex swap fee / SOL price advanced settings are removed; sample fees are autofetched (server-side on run, prefetchable on pair selection).

## Impact

- **Frontend**: `BacktestPanel.tsx`, `StrategySelector.tsx`, `BacktestGeneralSettings.tsx`, `BacktestCommissionSettings.tsx`, `App.tsx` wiring, new `useBacktestPanelState` + `backtestStorage` modules, new SampleFeesCard, shared primitives (SettingRow/StatusCallout/CardSkeleton promotion), `frontend/src/utils/candleLimit.ts` additions, tests (`backtest-flow.test.tsx` updated, new hook/storage/guardrail tests).
- **Backend**: new `GET /api/backtest/dex-fee` route + SOL/USD fetcher in `backend/src/routes/backtest.ts` (additive; existing inline POST fetch untouched), unit tests.
- **Non-goals**: no changes to live-trading symbol/timeframe header state; no container wiring fix (compose port/nginx proxy) — recorded as a recommendation; no i18n/animations work.

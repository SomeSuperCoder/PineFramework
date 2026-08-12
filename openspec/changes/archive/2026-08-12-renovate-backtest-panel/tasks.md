## 1. Design foundation (Wave 1 — parallel)

- [x] 1.1 Frontend UI Designer: visual spec for the renovated backtest panel matching the TelegramConfigPanel bar (Card shell, SectionHeaders, SettingRows, StatusCallout, h-10, theme tokens, zero raw hex). Read archived design docs first. Deliverable: spec doc only.
- [x] 1.2 UX Designer: guardrail + flow spec for both date-range modes (days-back via `candleLimit.ts` slider bounds; explicit range start<=end, end<=today, min 1 day, max safe days; clamp-on-change + clamp-on-mount; run-block vs warn semantics; sample-fees card empty/loading/error states). Deliverable: spec doc only.
- [x] 1.3 Design System Engineer: promote `SettingRow`/`StatusCallout`/`CardSkeleton`/`SectionHeader` to a shared location import-compatible with TelegramConfigPanel; define success/error theme tokens replacing raw hex. No changes to BacktestPanel files.

## 2. Frontend state refactor (Wave 2-FE-1)

- [x] 2.1 Implement `useBacktestPanelState` hook (strategy, initialCapital, timeframe, symbol, dateRangeMode/daysBack/startDate/endDate, commissionMethod + settings) mirroring `useTelegramSettings`.
- [x] 2.2 Implement `backtestStorage.ts` migration: single `pine-backtest-settings` key, add `timeframe`/`symbol`, clamp out-of-bounds migrated values on mount.
- [x] 2.3 Extend `candleLimit.ts` with explicit-date-range guardrail rules (pure additions, keep existing tests green).
- [x] 2.4 Rewire `App.tsx`: drop `symbol`/`timeframe` props to BacktestPanel; `handleRunBacktest` reads them from the panel payload; header live-trading state untouched.

## 3. Frontend redesign + bug fix (Wave 2-FE-2)

- [x] 3.1 Renovate `BacktestPanel.tsx` composition per visual spec (Cards: Strategy → General → Commission/SampleFees; SectionHeaders, SettingRows, h-10, StatusCallout, aria).
- [x] 3.2 Fix `StrategySelector.tsx` bug: relative `/api/scripts` + `/api/scripts/built-in` fetch (QuickAdderPopup precedent); refetch on reopen (drop `!error` gate); remove hardcoded `backendUrl` dependency; h-10.
- [x] 3.3 Deprecate advanced settings: remove manual dexFeeBps/solPriceUsd inputs from `BacktestCommissionSettings.tsx`; keep commission-method select + vestigial defaults for backend compat; read-only autofetch display replaces inputs.
- [x] 3.4 Fix raw-hex violations + non-uniform heights across panel components (tokens + h-10).

## 4. Backend sample-fees endpoint (Wave 2-BE)

- [x] 4.1 API Designer: endpoint contract `GET /api/backtest/dex-fee?symbol=<SYMBOL>` (200 FeeFetchResult + optional solPriceUsd, 400 validation, 404 feature-absent, 503 upstream failure).
- [x] 4.2 Backend Engineer: implement route in `backend/src/routes/backtest.ts` (additive, existing POST untouched) + tiny SOL/USD fetcher with disk cache (~5–15 min TTL).
- [x] 4.3 Backend Engineer: wire `fetchDexFeeBps` as-is into the route; no refactor of the fetcher.

## 5. Feature-gated sample fees display (Wave 2-FE-3)

- [x] 5.1 Frontend Engineer: SampleFeesCard with capability probe on mount + symbol change; 404 → hide card entirely; 200 → StatusCallout (dexFeeBps + source badge + dexLabel + solPriceUsd when present); CardSkeleton loading + aria-busy; destructive callout + retry on 503/network error.

## 6. Testing (Wave 3)

- [x] 6.1 Test Engineer: update `backtest-flow.test.tsx` for new `onRun` signature / App wiring (keep flow assertions).
- [x] 6.2 Test Engineer: new `use-backtest-panel-state.test.tsx` + storage-migration tests + extended `candleLimit.test.ts` (explicit-range rules).
- [x] 6.3 Test Engineer: backend unit tests for dex-fee endpoint (validation, 503, cache-fallback, 404-absent).
- [x] 6.4 Test Engineer: SampleFeesCard tests (404 hides, 200 shows, error+retry, solPriceUsd optional) — unit-level; Playwright deferred unless endpoint fully lands.

## 7. Review & delivery (Wave 4)

- [x] 7.1 Code Reviewer: diff review (state refactor, storage migration, App wiring, endpoint) — ONE reviewer, consumes TE verdict.
- [x] 7.2 Visual compliance check against W1-1 spec (TelegramConfigPanel bar matched, zero raw hex).
- [x] 7.3 Tech Lead: User Intent Gate vs Director's 5 requirements + commit at feature boundaries.

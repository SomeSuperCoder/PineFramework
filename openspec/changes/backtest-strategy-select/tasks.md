## 1. Backend — Early script validation

- [ ] 1.1 Add request-time guard in `POST /api/backtest` (`backend/src/routes/backtest.ts`, after the timeframe check): missing/empty/non-string `script` → `400 { error: 'Missing or invalid "script" field' }`; verify `express.json({ limit })` (or default) at `backend/src/index.ts` — no script large enough for `413` risk. [spec `strategy-backtest-engine` — "Backtest Request SHALL Require Strategy Source"; design D4]
- [ ] 1.2 Keep the async `runBacktest` guard (defense-in-depth) unchanged.

## 2. Frontend — StrategySelector adapter (backward compatible)

- [ ] 2.1 Add optional props `label?`, `placeholder?`, `height?` to `frontend/src/components/StrategySelector.tsx` with existing UI as defaults; do NOT change the `onChange`/value contract of the existing `source`+`name` — `TradingBotPanel.tsx:862` must stay untouched.
- [ ] 2.2 (verify only) TypeScript + lint clean; existing panels' behavior unchanged (grep consumers — only `TradingBotPanel`).

## 3. Frontend — BacktestPanel dropdown + seam

- [ ] 3.1 Rework `frontend/src/components/BacktestPanel.tsx`: add `selectedStrategy` state and the dropdown (adapted `StrategySelector`); emit the selected strategy (id/name/source) via the run callback.
- [ ] 3.2 Update `handleRunBacktest` in `App.tsx` (line ~343): accept selected strategy — if none, surface "Select a strategy to backtest." and return WITHOUT `submitBacktest`; else `{ ...config, script: selected.source }`.
- [ ] 3.3 Delete the chart-derived `strategySource` block in `App.tsx` (lines 320-335) — chart is no longer the backtest source of truth.
- [ ] 3.4 Decommission legacy `BacktestSettingsPopup.tsx`: remove the render in `App.tsx` (lines 661-668), remove `showSettingsValue` state, and rewire `StrategyResultsPopup`'s "Open settings" action to navigate to the backtest panel instead.
- [ ] 3.5 (verify only) `handleRunBacktest` never sends an empty `script` (all paths assert `selected.source` before POST).

## 4. Frontend — UI/UX polish (per CONTROL-PANEL-DESIGN.md §5.3)

- [ ] 4.1 Align panel to the §5.3 config bar `[Select Strategy ▾] [Symbol] [Timeframe] [Date Range] [Run Backtest ▼]`; only design tokens (no hardcoded hex in new code).
- [ ] 4.2 Loading + empty states for the strategy dropdown; disable Run until a strategy is selected; visible validation message (`role="alert"`/`aria-live`); run-in-flight → Run disabled until the job resolves.
- [ ] 4.3 Accessible combobox: label associated, `aria-expanded`/`aria-controls`, keyboard nav, focus-visible; 36px height respects wide strategy names in the config bar.

## 5. Tests

- [ ] 5.1 Backend T2 route test (new): `POST /backtest` without `script` → `400 { error: ... }` + no job created (GET job → 404); with `script` → 200 `{ job_id }`.
- [ ] 5.2 Frontend: update `frontend/src/__tests__/backtest-flow.test.tsx` — mock strategy API (scripts + built-ins), open dropdown, select strategy → assert POST body carries that strategy's `script`; no selection → error surfaced + no POST; `StrategyResultsPopup` settings action → panel nav; delete `BacktestSettingsPopup.test.tsx`.

## 6. Sign-off

- [ ] 6.1 QA acceptance (T3): dropdown sources strategies; run submits `script`; no-selection blocked; legacy popup gone; regression on `TradingBotPanel` selector; tests green (consume Test Engineer verdict — no suite re-run).
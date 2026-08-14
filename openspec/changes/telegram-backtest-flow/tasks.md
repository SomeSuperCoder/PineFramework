# Tasks — telegram-backtest-flow

## 1. Producer seam

- [ ] 1.1 Create `backend/src/telegram/backtest/runTelegramBacktest.ts` — neutral service that maps wizard settings (strategy id, symbol, timeframe, daysBack, commission method) to the same config mapping as the CLI (`resolveDateRange`, `normalizeExplicitOverride`, `applyDexFee`), resolves the strategy source from the library, assembles bars within the engine bar cap, and calls `runBacktestPipeline`. Returns the standard result shape; surfaces engine/fee errors as typed failures with sanitized messages. No changes to CLI/HTTP/export behavior.

## 2. Result card renderer

- [ ] 2.1 Create `backend/src/telegram/report/backtestCard.ts` — pure `renderBacktestCard(result, labels) → Promise<Buffer>`: SVG template (800×440, trading-stats palette/fonts), `escapeXml` on all injected values, concise metrics (net PnL abs/%, trade count, win rate, profit factor when computable, max drawdown, Sharpe, buy & hold return, effective settings), sharp rasterization. No fs/telegram/i18n imports.

## 3. Bot wizard

- [ ] 3.1 Create `backend/src/telegram/backtest/wizard.ts` — `/backtest` command + `bt:*` callback family: strategy → symbol → timeframe → days-back (timeframe-aware, cap-safe presets) → commission method → run. Layered inline keyboards, back/cancel/restart, per-chat session state, stale-callback guard, empty-library and invalid-selection localized states.
- [ ] 3.2 Wire registration into the existing bot registries (`actions[]` + `EMITTED_CALLBACK_PREFIXES`) in the bot feature module — minimal edits only.
- [ ] 3.3 Execution path: immediate localized "running…" ack, fire-and-forget async run via the producer seam, per-chat single-run guard, send result card via `sendPhoto` with localized caption, sanitized localized error on failure.

## 4. i18n

- [ ] 4.1 Add en/es/ru keys for every new user-facing string (wizard steps, buttons, running/cancel messages, result caption, empty state, errors) under the existing i18n mechanism.

## 5. Verification

- [ ] 5.1 Test Engineer: unit tests for the producer seam (config mapping parity with CLI, bar-cap validation, fee-failure surfaced), the renderer (buffer output, metric rendering, escaping, no-trade case), and the wizard (step transitions, back/cancel/restart, stale callbacks, empty library, single-run guard, i18n resolution).
- [ ] 5.2 Code Reviewer (single T3 reviewer): diff review against spec + design, lane check, static analysis on the new modules.

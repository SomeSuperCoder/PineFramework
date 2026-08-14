# Tasks — telegram-backtest-flow

## 1. Producer seam

- [x] 1.1 Create `backend/src/telegram/backtest/runTelegramBacktest.ts` — neutral service that maps wizard settings (strategy id, symbol, timeframe, daysBack, commission method) to the same config mapping as the CLI (`resolveDateRange`, `normalizeExplicitOverride`, `applyDexFee`), resolves the strategy source from the library, assembles bars within the engine bar cap, and calls `runBacktestPipeline`. Returns the standard result shape; surfaces engine/fee errors as typed failures with sanitized messages. No changes to CLI/HTTP/export behavior.
  - **Agent:** backend-engineer (M2)
  - **Verdict:** ✅ DONE — `tsc --noEmit` PASSED
  - **Evidence:** handoff `data/handoffs/team/backend/backend-engineer/telegram-backtest-producer.json`; TE GREEN 249/249

## 2. Result card renderer

- [x] 2.1 Create `backend/src/telegram/report/backtestCard.ts` — pure `renderBacktestCard(result, labels) → Promise<Buffer>`: SVG template (800×440, trading-stats palette/fonts), `escapeXml` on all injected values, concise metrics (net PnL abs/%, trade count, win rate, profit factor when computable, max drawdown, Sharpe, buy & hold return, effective settings), sharp rasterization. No fs/telegram/i18n imports.
  - **Agent:** telegram-bot-engineer (M1, retry after silent transport)
  - **Verdict:** ✅ DONE — `tsc --noEmit` PASSED
  - **Evidence:** handoff `data/handoffs/team/telegram/telegram-bot-engineer/backtest-card.json`; TE card tests 6/6

## 3. Bot wizard

- [x] 3.1 Create `backend/src/telegram/backtest/wizard.ts` — `/backtest` command + `bt:*` callback family: strategy → symbol → timeframe → days-back (timeframe-aware, cap-safe presets) → commission method → run. Layered inline keyboards, back/cancel/restart, per-chat session state, stale-callback guard, empty-library and invalid-selection localized states.
  - **Agent:** telegram-bot-engineer (M3)
  - **Verdict:** ✅ DONE-WITH-ISSUES — artifact verified by Tech Lead (typecheck + full diff review); agent handoff JSON missing (silent transport symptom, seen 3×)
  - **Evidence:** `backend/src/telegram/backtest/wizard.ts` + `keyboards.ts`; TE wizard tests 12/12
- [x] 3.2 Wire registration into the existing bot registries (`actions[]` + `EMITTED_CALLBACK_PREFIXES`) in the bot feature module — minimal edits only.
  - **Agent:** telegram-bot-engineer (M3)
  - **Verdict:** ✅ DONE — `bt:` prefix in both registries, `/backtest` registered exactly once (verified in code review)
  - **Evidence:** `backend/src/telegram/TelegramBotFeature.ts`; reviewer APPROVE
- [x] 3.3 Execution path: immediate localized "running…" ack, fire-and-forget async run via the producer seam, per-chat single-run guard, send result card via `sendPhoto` with localized caption, sanitized localized error on failure.
  - **Agent:** telegram-bot-engineer (M3)
  - **Verdict:** ✅ DONE — `void this.executeRun(...)` never awaited; running guard; onPhoto transport + text fallback
  - **Evidence:** wizard.ts run/executeRun; TE single-run + fallback tests

## 4. i18n

- [x] 4.1 Add en/es/ru keys for every new user-facing string (wizard steps, buttons, running/cancel messages, result caption, empty state, errors) under the existing i18n mechanism.
  - **Agent:** telegram-bot-engineer (M3)
  - **Verdict:** ✅ DONE — 52 `backtest*` keys × 3 languages (143 keys total per TE)
  - **Evidence:** `backend/src/telegram/i18n.ts`; TE i18n parity test GREEN (updated 91→143 count)

## 5. Verification

- [x] 5.1 Test Engineer: unit tests for the producer seam (config mapping parity with CLI, bar-cap validation, fee-failure surfaced), the renderer (buffer output, metric rendering, escaping, no-trade case), and the wizard (step transitions, back/cancel/restart, stale callbacks, empty library, single-run guard, i18n resolution).
  - **Agent:** test-engineer (M4, retry after silent transport)
  - **Verdict:** 🟢 GREEN — 249/249 across 15-file blast-radius set; 29 new unit tests
  - **Evidence:** handoff `data/handoffs/team/quality/test-engineer/telegram-backtest-tests.json`; run: `pnpm exec vitest run backend/tests/telegram-backtest-*.test.ts backend/tests/backtest-card.test.ts backend/tests/telegram-feature.test.ts backend/tests/render-card.test.ts backend/tests/i18n.test.ts`
- [x] 5.2 Code Reviewer (single T3 reviewer): diff review against spec + design, lane check, static analysis on the new modules.
  - **Agent:** code-reviewer (M5)
  - **Verdict:** ✅ APPROVE — all 8 spec areas verified, no blocking findings; 6 non-blocking notes → `recommendations/general/2026-08-14-telegram-backtest-review.md`
  - **Evidence:** handoff `data/handoffs/team/quality/code-reviewer/telegram-backtest-review.json`

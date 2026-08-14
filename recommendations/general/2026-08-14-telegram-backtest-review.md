# Telegram /backtest wizard — non-blocking review notes
**Date:** 2026-08-14
**Source:** team/quality/code-reviewer
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr) each

## Recommendation 1 — Guard `/backtest` / Restart during an in-flight run
**File:** backend/src/telegram/backtest/wizard.ts (`start()` ~line 142, `restart()` ~line 415, `executeRun()` ~line 313)
**Problem:** `start()`/`restart()` unconditionally `sessions.set(chatId, { running: false, ... })`, replacing the session while an old run is in flight. When the old run completes, `executeRun` edits the message (now showing the NEW wizard's step) to "Backtest done!" and `sessions.delete(chatId)` — silently destroying the user's new wizard.
**Fix direction:** in `start()`/`restart()`, if the existing session has `running === true`, reject with `backtestAlreadyRunning` (parity with the run-step guard); or tag the in-flight run with a session-identity token so completion only cleans up when the session object is still the same.

## Recommendation 2 — Export MAX_BARS as SSOT (seam duplicates the engine literal)
**File:** backend/src/telegram/backtest/runTelegramBacktest.ts:98 (mirrors backtest-runner.ts:58)
**Problem:** the seam's local `MAX_BARS = 1500` duplicates the engine's literal. Self-flagged in the code comment; engine re-check is defense-in-depth, but drift risk remains.
**Fix direction:** export the constant from backtest-runner.ts (or a shared constants module) and import it in the seam.

## Recommendation 3 — Extract shared error sanitizer (URL/hostname redaction)
**File:** backend/src/telegram/backtest/runTelegramBacktest.ts:111 (mirrors routes/backtest.ts:299-300)
**Problem:** duplicate redaction logic across routes and the seam. Also the hostname regex over-matches dotted identifiers (e.g. "ta.ema" → "[redacted-host]") — currently zero user impact because the wizard discards the message and localizes by error code, but it would corrupt diagnostics if `error.message` is ever displayed.
**Fix direction:** extract one shared `sanitizeUserMessage` in a neutral module and reuse it in both call sites.

## Recommendation 4 — Align backtestCard capital fallback docs with code
**File:** backend/src/telegram/report/backtestCard.ts:214-218 (interface doc) vs :291
**Problem:** `BacktestCardLabels.settingsValues.capital` is documented as a fallback, but the renderer always uses `formatMoney(result.effectiveConfig.initialCapital)` (always present via `DEFAULT_STRATEGY_CONFIG.initialCapital`, so no bug — just dead contract surface).
**Fix direction:** either actually fall back when `initialCapital` is undefined, or update the interface docs to say the value is ignored.

## Recommendation 5 — wizard.ts is 569 lines (over the ~500 gate)
**File:** backend/src/telegram/backtest/wizard.ts
**Problem:** the design flagged TelegramBotFeature.ts as over-gated and moved logic into new modules, but wizard.ts itself exceeds the gate. Cohesive single class; split into step-handler modules only if it grows further.
**Fix direction:** future refactor, not this change.

## Recommendation 6 (note, pre-existing) — escapeMarkdownV2 never escapes `*`
**File:** backend/src/telegram/TelegramService.ts:25
**Problem:** `escapeMarkdownV2` preserves `*` (intentional for i18n bold pairs). A strategy name containing `*` could distort MarkdownV2 emphasis in the text-fallback title (`backtestTextTitle` uses `*...*`). Pre-existing transport convention affecting all bot messages; wizard follows it. Note only — not introduced by this change.

# Design — telegram-backtest-flow

## Context

The bot already sends a "trading stats" card rendered as an SVG→PNG image (`backend/src/telegram/report/renderCard.ts`, `renderGlobalPnlCard`), and the backend already runs backtests end-to-end via CLI and HTTP paths built on the shared `runBacktestPipeline` engine. The new capability adds a Telegram wizard that collects settings and sends a concise result card — reusing both existing pieces. See proposal.md — Why; the behavior contract is in specs/telegram-backtest/spec.md.

Key constraints from exploration:
- Engine hard cap: `bars.length > 1500` → error (backend/src/backtest-runner.ts:58-63). The CLI's flat per-timeframe defaults exceed this on 60m+ long ranges; the wizard must be cap-aware.
- Strategy library manifest (`backend/data/scripts/manifest.json`) is currently **empty** — the picker must handle zero scripts.
- The bot has **no wizard/state machine** today; its established interaction pattern is layered inline keyboards + `editMessage` + callback-prefix gates.
- Fee resolution (`applyDexFee`) can THROW on live-fetch failure for jupiter methods without an explicit `dexFeeBps` — same semantics the CLI/HTTP surfaces.

## Goals / Non-Goals

**Goals**
- New `/backtest` wizard + result card, in-process, reusing the existing engine and card style.
- Zero behavior change to CLI, HTTP API, export schema, or frontend.
- Bot stays responsive during a run; failures surface as sanitized, localized messages.
- Timeframe-aware days-back presets so a valid selection never trips the 1500-bar cap.

**Non-Goals**
- No Mini App / web UI (Director chose the inline-keyboard conversation).
- No async-job HTTP API, no progress percentages, no cancellation of an in-flight run (v1).
- No changes to fee resolution, warning semantics, or the result data model.
- No new runtime dependencies (sharp is already a backend dependency).

## Decisions

### D1: In-process producer seam instead of self-HTTP async-job polling
The bot lives inside the backend package. Instead of POSTing to its own HTTP API and polling `GET /api/backtest/:jobId` (Scout B's suggestion), add a neutral service module (`backend/src/telegram/backtest/runTelegramBacktest.ts`) that reuses `runSymbolBacktest`'s config mapping (`resolveDateRange`, `normalizeExplicitOverride`, `applyDexFee`) directly.
- **Why:** topology-independent (works whether or not the web server is up alongside the bot); reuses the exact tested config mapping without duplicating it; avoids self-HTTP round-trips and job-lifecycle machinery for a synchronous-ish, capped run.
- **Alternative considered:** HTTP async-job model — rejected for v1: couples the bot to the API being reachable, adds polling/expiry state, and buys no correctness for a ≤1500-bar run. Revisit if runs ever exceed a few seconds.
- **Risk:** in-process engine could block the bot event loop → mitigated: fetch is async I/O, execution is bounded by the 1500-bar cap, and the run executes in a fire-and-forget async task (see D3).

### D2: Result card mirrors the trading-stats card renderer
New `backend/src/telegram/report/backtestCard.ts`: a pure `renderBacktestCard(result, labels) → Promise<Buffer>` that builds an SVG from a dedicated template and rasterizes with sharp at 800×440, using the same palette/fonts/helpers as `renderGlobalPnlCard` (no fs/telegram/i18n imports; `escapeXml` on all injected values).
- **Why:** matches the Director's "the same way trading stats works"; keeps the renderer unit-testable; zero coupling to telegraf.
- **Alternative considered:** reusing `PNL_CARD_SVG` directly — rejected: metrics/layout differ enough that a dedicated template is clearer than parameterizing the PnL card.

### D3: Layered inline-keyboard wizard with per-chat session state
`backend/src/telegram/backtest/wizard.ts`: `/backtest` command + `bt:*` callback family (strategy → symbol → timeframe → days-back → commission → run). Per-chat session map holds partial settings; each step re-renders the current message via `editMessage`; back/cancel/restart controls; stale-callback guard; registry additions to the two existing gates (`actions[]` and `EMITTED_CALLBACK_PREFIXES`).
- **Why:** matches the codebase's existing interaction pattern; no new dependency; the per-chat map is trivially garbage-collected on completion/cancel.
- **Alternative considered:** a wizard-state library or persistent session store — rejected: overkill for 5 fixed steps.

### D4: Timeframe-aware days-back presets (cap-safe)
Presets are derived per timeframe so the implied bar count stays ≤ 1500 (e.g. 60m → 7/30/60 days; D → 30/90/365). The run step also validates the assembled bar count and rejects with a localized message.
- **Why:** the naive flat preset list (7/30/90/365) exceeds the engine cap on intraday timeframes — a real bug the Telegram Lead's first draft would have shipped.
- **Alternative considered:** letting the engine error surface — rejected: the user should never reach a run that is doomed by the cap.

### D5: Fire-and-forget execution with immediate ack and single-run guard
On the run step, the bot edits to a localized "running…" message, executes the async pipeline without awaiting it in the handler, then sends the card (or error) via the `sendPhoto`/`sendMessage` seam. A per-chat in-flight flag rejects a second run while one is active.
- **Why:** the handler returns instantly → bot stays responsive; matches existing `onPhoto`/report send patterns.
- **Risk:** process restart drops an in-flight run → accepted for v1 (user re-runs); the "running…" state is per-process memory.

### D6: Empty-library and error states are first-class
Empty manifest → localized empty-state and end the wizard. Failed runs (engine error, fee-fetch failure, timeout) → sanitized localized message, no stack traces.

### D7: i18n via the existing mechanism
All new strings added to en/es/ru resources under the existing i18n key convention; wizard resolves via the same `t(lang, key, params)` helper as other bot messages.

## Risks / Trade-offs

- [In-process run blocks event loop] → async fire-and-forget task + 1500-bar cap keeps CPU bounded; network fetches are async.
- [Fee-fetch failure aborts run] → surfaced as sanitized localized error; parity with CLI semantics (per locked fee contract).
- [TelegramBotFeature.ts is ~1250 lines, over the 500-line gate] → wizard + renderer + producer live in new modules; the feature file only gains registry wiring (a few lines). Flag a follow-up refactor recommendation, do not refactor in this change.
- [Strategy library empty today] → empty-state UX handled; no crash.
- [In-flight run lost on restart] → accepted; per-chat guard is process-local. Note as known limitation in the final report.

## Migration Plan

- Deploy: backend package only. Add new files; register command + callbacks; no schema/migration; no env changes.
- Rollback: revert the bot feature registration commit — CLI/HTTP/export are untouched, so nothing else regresses.

## Open Questions

None that change specs, approach, or task breakdown. (Optional follow-ups — deferred: progress updates, cancellation, run history — are recorded as recommendations, not blocking.)

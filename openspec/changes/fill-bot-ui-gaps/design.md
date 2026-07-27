## Context

The live trading bot frontend lives in `frontend/src/components/TradingBotPanel.tsx` (906 lines). It exports:

- `useBotWebSocket(backendUrl)` — WebSocket hook for real-time bot state/logs
- `WalletImportPanel` — seed phrase import with confirm-replace
- `BotConfigPanel` — strategy source, DEX, pairs, risk, auto-select
- `TradingBotControlButton` — toolbar button (Start/Stop/EmergencyStop/Reset)
- `LiveDashboard` — bottom panel with Setup/Status/Metrics/Logs tabs

Current problems:

1. **Pairs textarea** takes raw symbol names (`SOLUSDT`) — hardcodes `timeframe: '60'` for all
2. **Auto-select checkbox** sends `true` to backend but shows no progress during backtesting
3. **Flat setup** — wallet import + config are stacked panels; no guided progression
4. **No strategy validation** — any Pine Script source is accepted as-is

The backend already supports all the required payloads. This change is frontend-only.

## Goals / Non-Goals

**Goals:**
- Enable per-pair timeframe specification in the pairs input
- Show live auto-select progress (which pair being evaluated, ranking when done)
- Restructure setup into a step wizard
- Add basic strategy compatibility warnings before starting

**Non-Goals:**
- No backend changes (not needed)
- No Telegram notification UI changes (Section 8 is separate)
- No commission model display (Section 10 is backend)
- No Sharpe ratio display (marked future in spec)

## Decisions

### Decision 1: Pair format — `SYMBOL TIMEFRAME` per line

**Choice:** Replace the pairs textarea placeholder with `SOLUSDT 60\nBTCUSDT 240\nETHUSDT 60` and parse each line as `[symbol, timeframe]`.

**Rationale:**
- The backend `PairConfig` type is `{ symbol: string; timeframe: string }` — this maps 1:1
- A single textarea is simpler and more discoverable than a table/matrix widget for the current Phase 2 stage
- The format is self-documenting and matches the spec's examples (`BTC 1m`)
- Numeric timeframe values match the backend's `VALID_TIMEFRAMES` (`'1'`, `'5'`, `'15'`, `'30'`, `'60'`, `'240'`, `'D'`, `'W'`)

**Alternatives considered:**
- Table with symbol column + timeframe dropdown: more UI work for Phase 2, not worth the complexity yet
- Symbol-only with a single global timeframe dropdown: violates the spec (Section 3.3 requires per-pair timeframes)

### Decision 2: Auto-select progress via WebSocket

**Choice:** The dashboard subscribes to auto-select progress events from the backend WebSocket on a `bot:autoSelect` channel, and displays a progress bar + current pair label.

**Rationale:**
- The backend `AutoMarketSelector` already has a `SelectionProgressCallback` with `{ current, total, pair, phase }`
- The engine emits `autoSelectionComplete` with full ranking results
- The existing WebSocket infrastructure (`DashboardWsService`, `useBotWebSocket`) already handles `bot:snapshot`, `bot:state`, `bot:log`, etc. — adding a new channel is consistent
- No polling needed — progress is pushed in real-time

**Note:** This requires a small backend change to wire the auto-select progress callback into the WS broadcast. The `bot-engine.ts` `start()` method calls `onAutoSelect`, and the broadcaster can wrap the callback. This is the **only** backend change in the entire proposal.

### Decision 3: Wizard — state machine inside the setup tab

**Choice:** Implement a `SetupWizard` component inside `LiveDashboard` with 3 steps tracked by `useState<'wallet' | 'config' | 'review'>`. Each step renders its own panel. The wizard validates before allowing "Next".

**Rationale:**
- Keeps all wizard state local to the dashboard (no prop drilling)
- Steps map to the spec's intent: wallet first (must have funds), then strategy config, then review
- Reuses existing `WalletImportPanel` and `BotConfigPanel` components — no rewrite
- The tab header shows step indicators (1→2→3) instead of the flat "Setup" label

**Steps:**
1. **Wallet** — Import wallet (existing panel). User must have a wallet to proceed.
2. **Config** — Strategy source, DEX, pairs, auto-select, risk settings (existing panel with updated pairs input). Must pass validation.
3. **Review** — Summary of all settings + Start button. Shows auto-select progress if enabled.

### Decision 4: Strategy compatibility — pattern-based check

**Choice:** Parse the strategy source for patterns that are incompatible with live spot trading: `strategy.entry` with `limit`/`stop` price syntax that doesn't apply to spot, or `strategy.position_size <= 0` checks for shorting. Show a warning banner but don't block.

**Rationale:**
- Full validation requires compiling the strategy, which the backend already does — we'd just be duplicating work
- A lightweight check catches the most common mistakes (e.g., using short-only logic on a spot-only engine)
- Warning (not error) respects the "it might still work" case

**Patterns to warn about:**
- `strategy.short` or ` strategy.exit` with `short` — spot only supports long
- `strategy.entry` with `limit` — not applicable to spot DEX swaps
- Reference to `strategy.openprofit` — requires position tracking that may differ live vs backtest

## Risks / Trade-offs

- **[Per-pair timeframe parsing]** A user typing `SOLUSDT 6` (missing a zero) would silently use `6` which is invalid. **Mitigation:** Validate the timeframe against `VALID_TIMEFRAMES` and show an inline error.
- **[Auto-select progress]** The WebSocket `bot:autoSelect` channel doesn't exist on the backend yet. **Mitigation:** The backend change is trivial — wrap the existing `SelectionProgressCallback` into a WS broadcast call.
- **[Wizard scope creep]** Adding steps could tempt adding more features (like Telegram config). **Mitigation:** Non-goals are explicit — wizard covers only wallet → config → review.
- **[Strategy patterns]** Pattern matching is inherently incomplete. A strategy could pass our check and still fail at runtime. **Mitigation:** The warning is non-blocking; the backend still does full validation on `configure()`.

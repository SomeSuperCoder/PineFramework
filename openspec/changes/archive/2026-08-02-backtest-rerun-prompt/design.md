## Context

The Review step in the trading bot wizard currently has no way to re-run a backtest. When a user reloads the page with a stale config (`autoSelect: true` but no resolved pairs), they're stuck — the Start button refuses, and there's no button to re-run the backtest. The backtest can only be triggered from the Config step, which is skipped on reload.

## Goals / Non-Goals

**Goals:**
- Add a "Re-run Backtest" button on the Review step when the config is stale
- Clicking the button advances the wizard to the Backtest step and auto-starts the backtest
- After backtest completion, return to Review with the resolved config

**Non-Goals:**
- Auto-running the backtest silently in the background (user should see progress)
- Changing the Config step or its persistence logic
- Modifying the engine's start validation (already fixed in `fix-bot-start-stale-autoselect`)

## Decisions

### Decision 1: Track backtest-run state in wizard, not backend

**Approach:** Add a `backtestRunThisSession: boolean` flag to the wizard state. Set to `true` when the Config step runs a backtest OR when the user re-runs from Review. The Review step checks this flag plus `config.autoSelect` to decide whether to show the re-run button.

**Why not backend tracking?** The backend has no session concept — each request is stateless. Adding a session flag would require WebSocket state or cookies, which adds complexity for a simple UI concern.

**Alternative considered:** Check if `config.pairs` is populated. But `pairs` might be populated from a previous session's backtest (before our persistence fix). The flag is more reliable.

### Decision 2: Advance to Backtest step on click, don't auto-advance on mount

**Approach:** When the user clicks "Re-run Backtest", programmatically advance the wizard to the Backtest step. The Backtest step's existing auto-start logic triggers the backtest.

**Why not auto-advance on mount?** The user should explicitly choose to re-run. Auto-advancing would be confusing — the user might not expect the wizard to jump steps on its own.

### Decision 3: Backtest step returns to Review on completion

**Approach:** After the backtest completes (pairs selected, config persisted), the wizard advances to the Review step. This is already the default flow — the Backtest step naturally progresses to Review.

**No changes needed** — the existing wizard flow already goes Backtest → Review after completion.

## Risks / Trade-offs

- **[Risk]** User might not notice the re-run button → Mitigation: Place it prominently next to the Start button with clear text explaining why it's needed
- **[Risk]** Backtest takes minutes, user might navigate away → Mitigation: Progress is visible in the AutoSelectGrid, same as the original flow
- **[Trade-off]** Tracking state in wizard means it resets on page reload → This is intentional — the user explicitly reloaded, so we treat it as a fresh session

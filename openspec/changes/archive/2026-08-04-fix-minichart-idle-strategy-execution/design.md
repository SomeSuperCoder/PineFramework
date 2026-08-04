## Context

See proposal.md — Why. In `LiveDashboard` (TradingBotPanel.tsx), `useBotMiniChartData` is invoked at line 1945 in the component body — before the `isIdle` early return (line 1962) that renders only the SetupWizard. React hooks run on every render regardless of what is returned, so the hook's side effects (OHLCV fetch → `POST /api/execute` → strategy execution, plus a kline WebSocket subscription with 100ms debounced re-execution) fire even when the mini chart component (line 2197, running view only) is never mounted.

Constraint: the hook is only "expensive" when `persistedConfig` has a pair + strategy source — exactly the saved-config case that triggers the bug.

## Goals / Non-Goals

**Goals:**
- No strategy execution, `/api/execute` calls, or kline subscriptions while the bot is Idle/Stopped.
- Mini chart behavior unchanged while the bot is Running/Stopping/Error.

**Non-Goals:**
- No changes to the `useBotMiniChartData` hook's data-fetching logic.
- No backend changes.

## Decisions

### D1: Extract mini chart into a child component that only mounts in running states
Split the running view into a dedicated component (e.g. `LiveBotView`) that owns `useBotMiniChartData` and renders `<MiniChart>`. `LiveDashboard` renders either `SetupWizard` (Idle/Stopped) or `LiveBotView` (Running/Stopping/Error) — never calling the hook itself.

**Rationale:** React only runs a hook when its component actually mounts. Gating by mount is the idiomatic, bug-proof fix — it makes "hook executes" structurally impossible in Idle state, instead of relying on a state guard inside the hook that could be missed on future render paths.

**Alternatives considered:**
- *Add an `enabled` param / `if (isRunning)` guard inside the hook* — works, but keeps the foot-gun: any future caller that forgets the guard reintroduces the bug. Rejected for robustness.
- *Move the hook call below the `isIdle` early return* — impossible: React hooks cannot be called after a conditional return; would violate rules-of-hooks.

### D2: Mini chart continues to re-execute on klines while running
Keep the hook's existing debounced re-execution and WebSocket subscription as-is. Since the hook now only lives inside `LiveBotView`, its behavior while running is unchanged and its idle behavior is "not mounted = no effect."

**Rationale:** Meets `mini-chart` spec "Indicator lookback period is satisfied" and "Mini chart updates in real time" requirements with zero behavioral change to the running path.

## Risks / Trade-offs

- [Component split touches the large 2330-line TradingBotPanel.tsx] → Mitigation: extract minimally, keeping all state/logic in `LiveDashboard` and passing only the data + render as props; verify with existing mini-chart unit tests.
- [A future refactor could render `LiveBotView` prematurely] → Mitigation: the spec delta (see `specs/mini-chart/spec.md`) pins the behavior — Idle must not execute the strategy — so a regression is caught by the scenario test.

## Migration Plan

Single-frontend change, no data migration. Rollback = revert the component extraction.

## Open Questions

None.

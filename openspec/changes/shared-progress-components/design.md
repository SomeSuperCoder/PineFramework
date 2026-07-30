## Context

The codebase has three locations with identical progress bar UI:
1. `BacktestPanel.tsx` — inline progress bar for single backtest (HTTP polling)
2. `StrategyResultsPopup.tsx` — modal progress bar for backtest results (HTTP polling)
3. `TradingBotPanel.tsx` — auto-select progress grid + bar (WebSocket)

Each uses the same pattern: a container div with a colored inner div whose width is `${progress}%`, plus phase text. The styling is copy-pasted with minor variations.

## Goals / Non-Goals

**Goals:**
- Single `ProgressBar` component used by all three locations
- Single `useAutoSelectProgress` hook encapsulating WebSocket auto-select state
- Zero behavior changes — pure visual/structural refactor
- Consistent styling across all progress indicators

**Non-Goals:**
- Changing the WebSocket protocol or HTTP polling logic
- Modifying the backtest execution engine
- Adding new progress features (e.g., ETA, cancel button)

## Decisions

### D1: ProgressBar component with variant prop

**Decision**: Create `<ProgressBar progress={number} phase={string} variant?: 'inline' | 'modal' />` component.

**Variants**:
- `inline` — compact bar with phase text below (used in BacktestPanel, TradingBotPanel backtest step)
- `modal` — centered bar with phase text (used in StrategyResultsPopup)

**Rationale**: The two use cases have different layouts but identical bar rendering logic. A variant prop keeps one component while allowing layout flexibility.

### D2: useAutoSelectProgress hook

**Decision**: Extract auto-select progress state from `useBotWebSocket` into `useAutoSelectProgress(backendUrl)` hook.

**Returns**: `{ autoSelectProgress, autoSelectResult, reset }` — same as current `useBotWebSocket` return values but scoped to auto-select.

**Rationale**: 
- `useBotWebSocket` currently handles connection, status, logs, AND auto-select progress — too many concerns
- The hook can be composed: `useBotWebSocket` calls `useAutoSelectProgress` internally, or consumers use it directly
- Cleaner testing — auto-select logic can be tested independently

### D3: Keep useBotWebSocket as composition root

**Decision**: `useBotWebSocket` continues to return `autoSelectProgress` and `autoSelectResult`, but delegates to `useAutoSelectProgress` internally.

**Rationale**: Existing consumers (`LiveDashboard`, `SetupWizard`) expect these values from `useBotWebSocket`. Changing the API would require updating all call sites for no benefit.

## Risks / Trade-offs

- **[Risk]** Visual regression in progress bars → **Mitigation**: Extract exact same styles, verify with screenshots
- **[Risk]** Hook extraction changes state timing → **Mitigation**: Keep identical state management logic, just move it
- **[Trade-off]** One more component file → outweighed by removing 3 copies of inline styles

## Why

Progress bar UI is duplicated in 3 places with identical inline styles:
- `BacktestPanel.tsx` lines 263-283 — single backtest
- `StrategyResultsPopup.tsx` lines 98-110 — modal backtest results
- `TradingBotPanel.tsx` lines 821-857 — auto-select backtest step

Each copy has its own progress bar markup, phase text, and percentage display. When one needs updating (e.g., adding animation, changing colors), all three must be changed manually. This violates DRY and makes the UI inconsistent.

## What Changes

- Extract a reusable `ProgressBar` component with consistent styling
- Extract a `useAutoSelectProgress` hook to manage WebSocket-based auto-select state
- Refactor `BacktestPanel`, `StrategyResultsPopup`, and `TradingBotPanel` to use shared components
- Remove duplicated inline progress bar styles

## Capabilities

### New Capabilities
- `shared-progress-bar`: Reusable progress bar component with phase text and percentage display
- `use-auto-select-progress`: Hook encapsulating WebSocket-based auto-select progress state management

### Modified Capabilities
None — this is a pure refactor with no behavior changes.

## Impact

- `frontend/src/components/ProgressBar.tsx` — new shared component
- `frontend/src/hooks/useAutoSelectProgress.ts` — new hook extracted from `useBotWebSocket`
- `frontend/src/components/BacktestPanel.tsx` — replace inline progress bar
- `frontend/src/components/StrategyResultsPopup.tsx` — replace inline progress bar
- `frontend/src/components/TradingBotPanel.tsx` — replace inline progress bar + extract hook usage

## 1. Create ProgressBar Component

- [x] 1.1 Create `frontend/src/components/ProgressBar.tsx` with `variant: 'inline' | 'modal'` prop
- [x] 1.2 Implement progress bar rendering: container div, inner fill div with width `${progress}%`
- [x] 1.3 Add phase text display: `{phase}... {progress}%` when running, indeterminate animation when queued
- [x] 1.4 Add status handling: completed shows 100%, failed hides bar
- [x] 1.5 Export component with proper TypeScript types

## 2. Create useAutoSelectProgress Hook

- [x] 2.1 Create `frontend/src/hooks/useAutoSelectProgress.ts` with WebSocket connection logic
- [x] 2.2 Move auto-select state management from `useBotWebSocket` into new hook
- [x] 2.3 Implement `bot:autoSelect` progress/complete message parsing
- [x] 2.4 Implement `reset()` function and bot state change handling
- [x] 2.5 Export hook with proper TypeScript types

## 3. Refactor BacktestPanel

- [x] 3.1 Import `ProgressBar` component
- [x] 3.2 Replace inline progress bar (lines 263-283) with `<ProgressBar progress={progress} phase="Processing" variant="inline" />`
- [x] 3.3 Remove unused inline styles

## 4. Refactor StrategyResultsPopup

- [x] 4.1 Import `ProgressBar` component
- [x] 4.2 Replace inline progress bar (lines 98-110) with `<ProgressBar progress={progress} phase={phase} variant="modal" status={status} />`
- [x] 4.3 Remove unused inline styles

## 5. Refactor TradingBotPanel

- [x] 5.1 Import `useAutoSelectProgress` hook
- [x] 5.2 Update `useBotWebSocket` to delegate to `useAutoSelectProgress` internally
- [x] 5.3 Replace inline progress bar in backtest step with `<ProgressBar>` component
- [x] 5.4 Keep `AutoSelectGrid` for per-pair status (different purpose than progress bar)
- [x] 5.5 Remove duplicated auto-select state logic from `useBotWebSocket`

## 6. Verify

- [x] 6.1 Run TypeScript build — no new errors
- [x] 6.2 Visual check: BacktestPanel progress bar matches existing behavior
- [x] 6.3 Visual check: StrategyResultsPopup progress bar matches existing behavior
- [x] 6.4 Visual check: Auto-select backtest step progress bar matches existing behavior

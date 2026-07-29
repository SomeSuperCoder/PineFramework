## 1. Core: Parallel Execution Engine

- [x] 1.1 Add `runParallel` utility function to `src/trading/auto-select.ts` — generic async semaphore that runs tasks with bounded concurrency (design D2)
- [x] 1.2 Update `SelectionProgressCallback` type to include `statuses` map: `Record<string, { phase: string, status: 'pending'|'active'|'done'|'failed' }>` alongside existing `current/total/phase` fields (spec: per-pair progress tracking)
- [x] 1.3 Rewrite `AutoMarketSelector.select()` to use two-phase parallel execution: Phase 1 parallel bar fetch (bounded by concurrency), Phase 2 parallel backtest (bounded by concurrency) (design D1, spec: parallel backtest execution)
- [x] 1.4 Emit per-pair progress events with status map transitions during both phases (spec: status transitions)

## 2. Backend: Wire-up and Broadcast

- [x] 2.1 Update `backend/src/index.ts` `onAutoSelect` handler to pass concurrency option (default: 4) to `AutoMarketSelector` constructor
- [x] 2.2 Verify WebSocket broadcast of new progress event shape with `statuses` map is compatible with existing `botWS.broadcast` call

## 3. Frontend: Remove Manual Pair Selection

- [x] 3.1 Remove `PairMatrixTable` component from `TradingBotPanel.tsx`
- [x] 3.2 Remove `autoSelect` checkbox and state from `BotConfigPanel`
- [x] 3.3 Remove `parsedPairs` state and manual pair inputs from `BotConfigPanel` — `pairs` field in configure request is no longer user-editable (auto-select determines it)
- [x] 3.4 Update `ConfigValues` interface to remove `pairs` field (auto-select determines pairs)

## 4. Frontend: Parallel Progress Display

- [x] 4.1 Update `useBotWebSocket` hook to parse new `statuses` map from `bot:autoSelect` progress events
- [x] 4.2 Replace single progress bar in `SetupWizard` review step with a candidate grid/table showing per-pair status
- [x] 4.3 Implement status icons: gray dash (pending), spinner (active), green checkmark (done), red error (failed)
- [x] 4.4 Update `LiveDashboard` auto-select progress display to use the same grid/table component
- [x] 4.5 Show final ranking results in the grid after auto-select completes, with best pair highlighted

## 5. Tests

- [x] 5.1 Update `tests/unit/trading/auto-select.test.ts` — test parallel execution: verify concurrency limit is respected
- [x] 5.2 Add test for per-pair progress events: verify status map transitions are emitted correctly for each candidate
- [x] 5.3 Add test for failed fetch/backtest isolation: verify one candidate failure doesn't block others
- [x] 5.4 Add test for backward-compatible progress fields: verify `current/total/pair/phase` still present alongside `statuses`

## 6. Cleanup

- [x] 6.1 Remove dead code: `PairMatrixTable.tsx` deleted
- [x] 6.2 Run full test suite — 1946 passed, 5 pre-existing failures (no regressions)

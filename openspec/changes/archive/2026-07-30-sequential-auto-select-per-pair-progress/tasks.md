## 1. Backend: Sequential Execution

- [x] 1.1 Remove `runParallel` usage in `AutoMarketSelector.select()` — use sequential for-loop instead
- [x] 1.2 Remove `concurrency` parameter from constructor (unused in sequential mode)
- [x] 1.3 Add `candleProgress` to `SelectionProgressCallback` type: `{ fetched: number; total: number }`
- [x] 1.4 Compute candle count per pair: `min(1500, floor(90_days * 24 / timeframe_hours))`
- [x] 1.5 Emit progress with `candleProgress` during bar fetch phase

## 2. Frontend: Update Progress Types

- [x] 2.1 Update `AutoSelectProgress` type in `useAutoSelectProgress.ts` to include `candleProgress`
- [x] 2.2 Update `AutoSelectGrid` to accept and display per-pair candle progress

## 3. Frontend: Per-Pair Progress Bars

- [x] 3.1 Add mini progress bar to each row in `AutoSelectGrid` during fetching phase
- [x] 3.2 Show candle count text: "Fetching... 340/540 candles"
- [x] 3.3 Keep status icons for backtesting/done/failed phases

## 4. Verify

- [x] 4.1 Run TypeScript build — no new errors
- [x] 4.2 Verify sequential execution in backend logs

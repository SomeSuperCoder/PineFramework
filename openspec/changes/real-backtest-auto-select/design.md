## Context

The `AutoMarketSelector` in `src/trading/auto-select.ts` evaluates trading pairs by running backtests against historical bar data. Currently, it processes candidates **sequentially** — fetching bars and running backtests one at a time in a `for` loop. With 10 default candidates, this can take 30-60+ seconds depending on data availability and backtest complexity.

The frontend (`TradingBotPanel.tsx`) displays progress as a single `current/total` counter with a phase label, providing no visibility into which specific pairs are being evaluated or their individual status. The UI also still exposes a manual pair selection mode (`PairMatrixTable`) that conflicts with auto-select.

**Key files:**
- `src/trading/auto-select.ts` — `AutoMarketSelector`, `SelectionProgressCallback`, `BarFetcher`, `BacktestRunner` interfaces
- `backend/src/trading/auto-select-runner.ts` — `LiveBacktestRunner`, `BybitBarFetcher` implementations
- `backend/src/index.ts` — wires auto-select into `BotEngine`, broadcasts progress via WebSocket
- `frontend/src/components/TradingBotPanel.tsx` — `BotConfigPanel` (manual pair selection), progress display, `useBotWebSocket` hook

## Goals / Non-Goals

**Goals:**
- Run backtests across all candidate pairs in parallel (bounded concurrency)
- Show per-pair progress: which pairs are fetching, backtesting, completed, or failed
- Remove manual pair selection UI — auto-select is the only mode
- Maintain existing API contract (`SelectionProgressCallback` shape is additive, not breaking)

**Non-Goals:**
- Changing the candidate list or ranking algorithm
- Persisting auto-select results across sessions
- Supporting user-defined candidate lists (out of scope for now)
- Changing the DEX fee fetching or backtest pipeline internals

## Decisions

### D1: Two-phase parallel execution (fetch all bars first, then run all backtests)

**Decision**: Split into Phase 1 (parallel bar fetch) and Phase 2 (parallel backtest), each with concurrency control.

**Rationale**: Bar fetches are I/O-bound (Bybit API) and lightweight. Backtests are CPU-bound (Pine Script execution). Mixing them in a single pool risks starving backtests of CPU while waiting on fetches, or overwhelming the API with mixed workloads. Two phases also produce cleaner progress events — "all data loaded" is a natural checkpoint.

**Alternatives considered:**
- Single pool with mixed fetch+backtest tasks — rejected: harder to reason about progress, risk of API throttling during CPU-heavy backtests
- Fully sequential with progress per step — rejected: doesn't meet the parallel requirement

### D2: Concurrency limit via simple semaphore

**Decision**: Use a lightweight semaphore (counter-based) to cap concurrent operations at N (default: 4).

**Rationale**: No external dependencies needed. A simple async semaphore (Promise pool pattern) is sufficient. 4 concurrent backtests balances speed vs. memory/CPU usage on typical machines. The Bybit API also has rate limits — 4 parallel fetches is safe.

**Alternatives considered:**
- `Promise.allSettled` with no limit — rejected: would fire 10+ concurrent backtests, risking OOM and API throttling
- Worker threads — rejected: overkill for this use case, adds complexity
- External queue library (Bull, etc.) — rejected: adds dependency for something solvable in ~30 lines

### D3: Per-pair progress events with status map

**Decision**: Emit progress events that include a `statuses` map: `Record<string, { phase: string, status: 'pending'|'active'|'done'|'failed' }>`.

**Rationale**: The frontend needs to render a grid of all candidates with individual status. A single `current/total` counter can't convey "SOLUSDT is fetching while BTCUSDT is backtesting." The status map is additive — existing `current/total` fields are preserved for backward compatibility.

**Alternatives considered:**
- Emit individual events per pair — rejected: too chatty, floods WebSocket
- Emit only final results — rejected: no progress visibility during the 30-60s evaluation

### D4: Remove PairMatrixTable entirely

**Decision**: Delete the `PairMatrixTable` component and its state from `BotConfigPanel`. Pairs are always determined by auto-select.

**Rationale**: Manual pair selection is redundant when auto-select exists. Removing it simplifies the UI and eliminates a source of user confusion ("should I set pairs manually or use auto-select?").

### D5: Frontend grid layout for parallel progress

**Decision**: Replace the single progress bar with a table/grid showing each candidate pair, its phase, and status icon (spinner/checkmark/error).

**Rationale**: Users need to see which pairs are being evaluated and their individual outcomes. A grid provides at-a-glance visibility into the parallel evaluation process.

## Risks / Trade-offs

- **[Risk] Bybit API rate limits during parallel fetches** → Mitigation: Concurrency limit of 4 for fetches. Bybit's public API allows 100 requests/second; 4 parallel is safe.
- **[Risk] Memory pressure from multiple concurrent backtests** → Mitigation: Concurrency limit of 4. Each backtest uses ~10-50MB depending on bar count. 4 × 50MB = 200MB peak, acceptable.
- **[Risk] Breaking change in progress event shape** → Mitigation: `statuses` map is additive. Existing `current/total/phase` fields preserved. Frontend updated atomically.
- **[Trade-off] Two-phase vs. interleaved execution** → Two-phase means fetches complete before any backtests start. Slightly slower theoretical optimum but much simpler progress tracking and resource management.

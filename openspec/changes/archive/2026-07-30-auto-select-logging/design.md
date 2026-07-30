## Context

The auto-select flow runs backtests across multiple candidate pairs sequentially. When a pair fails (bars fetch error, backtest error, etc.), the status is set to 'failed' but no error message is included. The UI shows a generic "✗" with no explanation.

Current flow:
```
Backend (auto-select.ts):
  statuses[key] = { phase: 'backtesting', status: 'failed' }
  emitProgress(pair, 'backtesting')

Frontend (TradingBotPanel.tsx):
  StatusIcon: 'failed' → "✗"
  displayPhase: 'backtesting' (because status is 'failed', not 'done')
```

No error information is passed to the frontend.

## Goals / Non-Goals

**Goals:**
- Include error messages in `CandidateStatus` when pairs fail
- Display error messages in the AutoSelectGrid UI
- Add console logging for debugging
- Keep changes minimal and backward compatible

**Non-Goals:**
- Changing the auto-select algorithm
- Adding retry logic
- Changing the UI layout significantly

## Decisions

### Decision 1: Add optional `error` field to `CandidateStatus`

```typescript
export interface CandidateStatus {
  phase: 'fetching' | 'backtesting' | 'ranking';
  status: 'pending' | 'active' | 'done' | 'failed';
  error?: string;  // NEW: human-readable error message
}
```

**Rationale:** Optional field maintains backward compatibility. Only populated when status is 'failed'.

### Decision 2: Display error in AutoSelectGrid as tooltip

Show error message on hover (title attribute) and optionally as small text below the status icon.

**Rationale:** Keeps the grid compact while making errors accessible.

### Decision 3: Add console.log statements in backend

Log key events:
- `[auto-select] Fetching bars for SYMBOL (TIMEFRAME)...`
- `[auto-select] Fetched N bars for SYMBOL (TIMEFRAME)`
- `[auto-select] Running backtest for SYMBOL (TIMEFRAME)...`
- `[auto-select] Backtest complete: SYMBOL (TIMEFRAME) — PF: X.XX, PnL: X.X%`
- `[auto-select] Failed: SYMBOL (TIMEFRAME) — <error message>`

**Rationale:** Standard debugging approach, no new dependencies.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Error messages could be long | Truncate to 100 chars in UI, full message in console |
| Console logs could be noisy | Use `[auto-select]` prefix for easy filtering |

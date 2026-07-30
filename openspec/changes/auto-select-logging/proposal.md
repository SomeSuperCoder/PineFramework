## Why

The auto-select backtest flow has no visibility into failures. When backtests fail, the UI shows a generic "✗" status with no explanation. Users cannot diagnose:
- Why bars fetch failed (network error? invalid symbol? rate limit?)
- Why backtest failed (script error? not a strategy? insufficient data?)
- What the actual error message was

This makes debugging impossible without checking server logs.

## What Changes

- Add `error` field to `CandidateStatus` type
- Include error messages in progress updates when pairs fail
- Display error messages in the AutoSelectGrid UI
- Add console logging for each phase transition (fetching, backtesting, complete/fail)
- Log bar fetch counts and backtest results for debugging

## Capabilities

### New Capabilities

(none — this is observability improvement, not new behavior)

### Modified Capabilities

(none — no spec-level behavior changes)

## Impact

- **Files affected**:
  - `src/trading/auto-select.ts` — `CandidateStatus` type, progress emissions
  - `frontend/src/components/TradingBotPanel.tsx` — `AutoSelectGrid` error display
  - `frontend/src/hooks/useAutoSelectProgress.ts` — type updates
- **API**: WebSocket `bot:autoSelect` progress messages now include `error` field
- **No breaking changes**: `error` is optional, backward compatible

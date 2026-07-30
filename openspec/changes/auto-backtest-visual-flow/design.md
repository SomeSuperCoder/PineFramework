## Context

The setup wizard currently has 3 steps: Wallet → Config → Review. When the user clicks "Apply configuration" on the Config step, it immediately jumps to Review & Start. The auto-select backtests only run when the user clicks "Start Bot" on the Review step, making the process feel instant and uninformative.

The `AutoMarketSelector` already supports parallel backtest execution with per-pair progress callbacks (via `SelectionProgressCallback`). The WebSocket gateway already broadcasts `bot:autoSelect` progress events. The `AutoSelectGrid` component already renders per-pair status with icons.

**Current flow:**
1. Wallet → 2. Config → 3. Review (backtests run at start time)

**Desired flow:**
1. Wallet → 2. Config → 3. Backtest (visible) → 4. Review (with pre-computed results)

## Goals / Non-Goals

**Goals:**
- Add a "Backtest" step between Config and Review where auto-select runs visibly
- Show real-time per-pair progress grid with status icons during backtest execution
- Display final ranking with best pair highlighted before proceeding to Review
- User can go back to Config from Backstep step (cancels in-flight backtests)
- Review step shows pre-computed results; "Start Bot" no longer triggers backtests

**Non-Goals:**
- Changing the backend auto-select logic (already works correctly)
- Modifying the AutoMarketSelector or parallel execution engine
- Adding new WebSocket event types (reuse existing `bot:autoSelect` channel)
- Persisting backtest results across page reloads

## Decisions

### D1: Frontend-triggered backtest via WebSocket (not new HTTP endpoint)

**Decision**: Trigger auto-select from the frontend by sending a `bot:start` message with a `preStart: true` flag, or by reusing the existing configure + auto-select flow through WebSocket.

**Alternative considered**: New HTTP endpoint `/api/bot/backtest` that runs auto-select and returns results.
- Rejected because: The WebSocket gateway already broadcasts `bot:autoSelect` progress events. Adding a HTTP endpoint would duplicate the auto-select trigger logic and bypass the existing progress broadcast infrastructure.

**Approach**: 
1. Frontend sends `bot:configure` via WebSocket with the config
2. Backend runs auto-select and broadcasts progress via existing `bot:autoSelect` channel
3. Frontend receives progress and renders `AutoSelectGrid`
4. On completion, frontend receives `bot:autoSelect` complete event with ranking
5. User clicks "Next" to proceed to Review with pre-computed results

### D2: New wizard step "backtest" in SetupWizard

**Decision**: Add a 4th step `backtest` between `config` and `review`.

```
wallet → config → backtest → review
```

**Rationale**: Cleanly separates the backtest execution from the review decision. The backtest step is transient — once complete, the user can proceed or go back.

**State additions**:
- `step: 'backtest'` added to the union type
- `autoSelectProgress` and `autoSelectResult` moved to SetupWizard level (currently in useBotWebSocket)
- Backtest step renders `AutoSelectGrid` with live progress

### D3: Cancel backtests on back navigation

**Decision**: When user clicks "Back" from the backtest step, cancel any in-flight auto-select and return to config.

**Rationale**: User explicitly chose to go back — their config may change, invalidating the backtests.

**Implementation**: Close the WebSocket connection or send a cancel signal. Since auto-select is server-side, the simplest approach is to let it complete but discard the results when the user goes back.

### D4: Review step shows cached results

**Decision**: Review step reads `autoSelectResult` from state (populated by backtest step) instead of triggering new backtests.

**Rationale**: Backtests already ran in the previous step. Review should be a decision point, not an execution point.

## Risks / Trade-offs

- **[Risk]** User navigates away during backtests → **Mitigation**: Results are discarded; user can re-run from config step
- **[Risk]** Backend auto-select fails mid-way → **Mitigation**: Show error state in backtest step; user can go back and retry
- **[Risk]** WebSocket disconnection during backtests → **Mitigation**: Reconnect logic already exists; progress resumes from last known state
- **[Trade-off]** Extra step in wizard → Users see one more screen, but gain visibility into what was previously hidden

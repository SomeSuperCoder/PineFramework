## Context

The `LiveStrategyExecutor.processCandle()` in `src/trading/live-strategy-executor.ts` currently has placeholder logic (lines 131-174) that only handles long entries and exits. It never processes strategy markers with `direction: 'short'`. The strategy engine (`StrategyEngine`) correctly creates markers for short signals, but the live executor drops them silently.

The system runs on Jupiter Swap, a spot DEX where short selling is impossible. However, a short signal from a strategy is semantically equivalent to "close the current long position" — this is how TradingView interprets it.

## Goals / Non-Goals

**Goals:**
- Map `direction: 'short'` strategy markers to `action: 'close'` trade signals when a long position exists
- Log warnings when short signals are received but cannot be acted upon (flat or already short)
- Minimal code change — one method, no new types or dependencies

**Non-Goals:**
- Implementing actual short selling (not possible on spot DEX)
- Modifying the backtest engine (already handles shorts correctly)
- Changing the strategy engine's marker generation
- Supporting margin or futures

## Decisions

### 1. Modify `processCandle()` to detect short markers

**Decision**: Add a branch in `processCandle()` that checks for strategy markers with `direction: 'short'` and maps them to close signals.

**Rationale**: The current placeholder logic only checks `shouldEnterLong()` and `shouldExitLong()`. Instead of adding more placeholder methods, we should integrate with the actual strategy engine's markers. The `StrategyState` already has a `StrategyEngine` instance that produces markers via `getNewMarkers()`.

**Alternative considered**: Keep the placeholder logic and add short detection there. Rejected because the placeholder is a dead end — it doesn't execute the real Pine Script strategy.

### 2. Use existing `StrategyMarker` type for detection

**Decision**: Check `marker.direction === 'short'` on the `StrategyMarker` objects returned by `strategyEngine.getNewMarkers()`.

**Rationale**: The strategy engine already produces markers with `direction` field. No new types needed.

### 3. Emit `action: 'close'` for closing long positions

**Decision**: When a short signal arrives and position is long, emit `TradeSignal` with `action: 'close'`.

**Rationale**: The `TradeSignal` type already supports `action: 'close'` (line 55). The DEX adapter already handles close actions by swapping the held token back to USDC.

### 4. Log warnings for unactionable short signals

**Decision**: When flat or already short, log a warning via `console.warn` (consistent with existing logging in the codebase).

**Rationale**: Provides visibility without crashing or throwing. Users can see in logs why no trade was executed.

## Risks / Trade-offs

- **Risk**: The `processCandle()` method is still mostly placeholder logic. This change adds short handling but doesn't fix the underlying issue that the real Pine Script strategy isn't executed in live trading.
  → **Mitigation**: This is a targeted fix for a specific user-facing bug. Full strategy engine integration is a separate, larger change.

- **Risk**: If the strategy emits multiple short signals rapidly, we might try to close an already-closed position.
  → **Mitigation**: The DEX adapter and scheduler already handle idempotent close operations. The `position.direction` check prevents redundant signals.

## Implementation Notes

The change is confined to `src/trading/live-strategy-executor.ts`:
1. After the existing placeholder logic, add a check for short markers from the strategy engine
2. If `position.direction === 'long'` and a short marker exists, emit `action: 'close'`
3. Otherwise, log a warning

No new files, types, or dependencies required.

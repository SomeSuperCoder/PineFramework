## Context

The alert trigger rendering pipeline spans backend execution and frontend rendering:

1. **Backend**: `barsToContext()` creates `ExecutionContext` objects with `barIndex = 0-based array index` within the bars batch passed to the engine
2. **Engine**: `alertcondition()` builtins store `AlertTriggerEntry.barIndex` from `eng.currentContext.barIndex` — the same 0-based index
3. **Frontend**: `ScriptOutputs.alertTriggers` are sent over WebSocket, stored in `PineChart.alertTriggers`
4. **Rendering**: `MarkerRenderer.renderAlertTriggers()` uses `viewport.barIndexToPixel(trigger.barIndex)` to position orange dots

The `Viewport.barIndexToPixel()` computes `(barIndex - firstBarIndex) * barSpacing`, where `firstBarIndex` starts at 0 and is adjusted upward by `adjustForPrepend()` when more historical bars are loaded.

The core contract we must verify: **`barIndex` in execution engine = index in `candles[]` array = index in `Viewport` coordinate system**. Any break in this chain causes mispositioned dots.

## Goals / Non-Goals

**Goals:**
- Create a deterministic test fixture generator for OHLCV bars (1000+ bars) with predictable alert trigger patterns
- Write backend integration tests verifying `alertTriggers.barIndex` is within valid range and matches bar timestamp expectations
- Write frontend rendering tests for `Viewport.barIndexToPixel()` mapping correctness under various viewport states
- Write end-to-end prepend/re-execute tests simulating user loading more history
- Fix any positioning bugs found by the tests
- Document the expected multi-trigger-per-bar behavior for scripts with many `alertcondition()` calls

**Non-Goals:**
- Changing the alert data model or wire format
- Modifying the `ExecutionResult` / `ScriptOutputs` alert trigger schema
- Adding real WebSocket or UI-automation tests (pure unit/integration level)
- Performance optimization of alert rendering

## Decisions

### Decision 1: Two-layer test structure (backend + frontend) instead of full e2e
**Rationale**: The positioning bug could be in the backend (wrong `barIndex` emitted) or frontend (wrong pixel mapping). By testing each layer independently, we narrow the blast radius faster. Backend tests catch index emission bugs; frontend tests catch pixel mapping and viewport bugs. We also add a combined test that simulates the full `bars -> execute -> render` flow by constructing a mock frontend state from real backend output.

### Decision 2: Deterministic bar generator with seeded RNG
**Rationale**: Alert triggers depend on bar prices (e.g., close above/below threshold). Using a seeded pseudo-random generator (e.g., a simple LCG seeded with a fixed value) produces reproducible test data where we can predict which bars trigger alerts. This avoids flaky tests.

### Decision 3: Direct Viewport testability via exported helper
**Rationale**: `Viewport.barIndexToPixel` is already pure — it takes `barIndex` and reads `firstBarIndex` and `barSpacing` from internal state. We'll write tests that construct a `Viewport`, call `setTotalBars`/`adjustForPrepend`/`fitContent` to set known state, then assert `barIndexToPixel` and `pixelToBarIndex` are inverses.

### Decision 4: Prepend scenario simulated via `adjustForPrepend` then re-render
**Rationale**: The frontend's `setCandles()` detects prepended bars by comparing timestamps and calls `viewport.adjustForPrepend(added)`. Our tests will simulate this by calling `adjustForPrepend(n)` directly on a Viewport with known triggers, then verify `barIndexToPixel` still returns correct positions for old triggers.

## Risks / Trade-offs

- **[Risk] Tests pass but real UI still shows wrong positions**: The pixel calculation may be correct in isolation but the WebSocket data pipeline could corrupt `alertTriggers` on the wire. **Mitigation**: Add a combined "mock data pipeline" test that serializes/deserializes `ScriptOutputs` to simulate WebSocket transmission.
- **[Risk] Prepended bars cause cumulative index drift**: If the backend re-executes after prepend, `barIndex` values shift for old triggers. **Mitigation**: Verify that the frontend replaces all triggers on each response (it does via `setAlertTriggers(triggers)` which replaces the array). No cumulative accumulation occurs.
- **[Risk] Multiple triggers per bar mask position issues**: With 3+ dots per bar it's hard to visually confirm correct positioning. **Mitigation**: Use a simple test script with exactly **one** `alertcondition()` that triggers on a known bar pattern, making position verification unambiguous.

## Open Questions

- Does the frontend ever filter/trim `candles[]` independently of the backend `bars[]`? e.g., trimming oldest candles when the array grows too large. If so, `barIndex` values could point past the trimmed array.
- Is `alertTriggers` re-populated on each WebSocket message, or does the frontend accumulate triggers across messages?

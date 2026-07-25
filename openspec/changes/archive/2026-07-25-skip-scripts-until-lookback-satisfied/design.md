## Context

The pine-framework engine executes Pine Scripts bar-by-bar, maintaining series state across historical bars. Scripts like `ta.sma(src, 50)` require a lookback period of 50 bars before producing valid results. Currently, scripts execute on all visible candles regardless of whether their lookback requirements are met.

When a chart loads a historical chunk, the oldest candle may have fewer bars of history than the script's maximum lookback period. This causes:
- Labels stacking on the oldest candle (where the script produces its first valid output)
- Incorrect signal generation for partial-lookback bars
- Visual artifacts from scripts running with insufficient data

The issue appears with historical candles, not realtime candles.

## Goals / Non-Goals

**Goals:**
- Gate script execution on lookback satisfaction per candle
- Maintain "uncalculated" state for candles with unsatisfied lookback
- Preserve existing chunk-boundary rendering fixes (no regression)
- Support progressive computation with lookback-awareness

**Non-Goals:**
- Changing how lookback periods are calculated from scripts
- Modifying realtime candle execution (already correct)
- Changing the visual representation of "uncalculated" candles

## Decisions

### Decision: Lookback Length Detection

**Choice**: Use `max_bars_back` from script metadata plus any explicit lookback constants in the script.

**Rationale**: Pine Scripts declare their lookback requirements through series operations. The engine already tracks `max_bars_back` for series indexing. This value represents the maximum historical lookback the script needs.

**Alternatives Considered**:
- Static analysis of script AST: More accurate but complex and fragile
- Runtime tracking of actual lookback usage: Would require instrumentation overhead

### Decision: Execution Gating Location

**Choice**: Gate at the per-bar execution level in `ExecutionEngine`, before calling `executeBar()`.

**Rationale**: This is the single point where all bar execution flows through. Gating here ensures consistent behavior across all execution paths (historical, progressive, re-execution).

**Alternatives Considered**:
- Gate at progressive computation level: Would miss direct execution calls
- Gate at rendering level: Too late - script state would already be corrupted

### Decision: State Management for Uncalculated Candles

**Choice**: Skip execution entirely for candles where lookback is unsatisfied. Series values remain as their initial state (NaN for floats, empty for arrays).

**Rationale**: This matches Pine Script's native behavior where series values are NaN when insufficient history exists. Scripts should handle NaN naturally.

**Alternatives Considered**:
- Execute with synthetic initial values: Could produce incorrect intermediate states
- Mark candles as "pending" and re-execute later: Adds complexity without benefit

## Risks / Trade-offs

**[Risk] Scripts with dynamic lookback** → Some scripts calculate lookback dynamically. Mitigation: Use the maximum possible lookback from `max_bars_back` as a conservative estimate.

**[Risk] Performance of lookback check** → Adding a check per bar could impact performance. Mitigation: The check is O(1) - compare `bar_index` to a constant. Negligible overhead.

**[Risk] Breaking scripts that work around the bug** → Some scripts may depend on the current (incorrect) behavior. Mitigation: This is a bugfix; scripts should not depend on NaN-producing behavior.

**[Trade-off] Empty oldest candle** → The oldest visible candle may show no labels until next chunk loads. This is correct behavior - the candle genuinely doesn't have enough data for valid signals.

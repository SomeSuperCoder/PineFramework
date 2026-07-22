## Context

The candle coloring pipeline currently flows:

1. **Runtime builtins** (`plot-builtins.ts`): `barcolor()` and `plotcandle()` push `{time, color}` entries to `eng.barColorData[]`.
2. **Backend** (`execute.ts`): Maps `barColorData` entries to `{time, color}` objects in the API response.
3. **Frontend** (`PineChart.ts`): `setBarColors(colors: Map<number, string>)` stores a single color per bar index.
4. **CandlestickRenderer**: Applies `barColors?.get(i)` as the flat body/wick/border color, falling back to green/red for bullish/bearish.

This flat single-color model breaks for three patterns found in test_indicators:

- **Multi-element coloring** (volatility-trail.pine): `plotcandle()` with separate `color` (body), `wickcolor`, and `bordercolor` — each potentially from a different gradient.
- **Gradient coloring** (supertrend-ai-clustering.pine): `barcolor(color.from_gradient(...))` — the engine computes the gradient but the frontend discards per-bar gradient results.
- **Offset coloring** (conceptual Pine Script feature): `barcolor(color, offset=N)` shifts the applied color N bars.

The existing types (`BarcolorDescriptor`, `BarcolorOptions` in `rendering-types.ts`) and the plot engine's `barcolor()` method already anticipate `offset` but the runtime builtins and frontend do not use it.

## Goals / Non-Goals

**Goals:**
- Support per-candle multi-element colors (body, wick, border) end-to-end
- Support gradient-based bar coloring end-to-end
- Support `barcolor()` with `offset` parameter
- Preserve backward compatibility — existing single-color `barcolor()` continues to work
- All 7 test_indicators scripts using candle coloring produce visually correct output

**Non-Goals:**
- No new Pine Script color functions (existing `color.from_gradient` is sufficient)
- No changes to candle OHLC layout, bar spacing, or viewport logic
- No `plotcandle()` as a named plot output (it remains a color-only side effect)

## Decisions

### Decision 1: Unified `CandleColorData` type replaces flat per-bar map

**Chosen:** A `CandleColorData` interface with optional `body`, `wick`, and `border` fields per bar, plus an index-based lookup.

**Rationale:** The current `Map<number, string>` loses the distinction between body/wick/border. A richer type preserves multi-element data when it exists and degrades gracefully to single-color when it doesn't.

**Alternatives considered:**
- Three separate maps (one per element): More complex to manage in sync, harder to default.
- Flat array of structs: `Map<number, CandleColorData>` is simpler for the renderer's random-access per-bar loop.

**Data flow:**
```
Runtime builtins → ExecutionResult.barColorData: CandleColorEntry[]
Backend API → barColors: {time, bodyColor?, wickColor?, borderColor?}[]
Frontend PineChart → candleColors: Map<number, CandleColorData>
CandlestickRenderer → per-element lookups with fallback
```

### Decision 2: Runtime `barcolor()` stores offset in the data

**Chosen:** `barcolor()` stores `{time, color, offset}` in the entry. The offset is resolved at the frontend, not the runtime, because only the frontend knows the final bar index mapping.

**Rationale:** The runtime processes bars sequentially and doesn't have random access to shift colors. Moving the offset resolution to the frontend keeps the runtime stateless and the rendering correct.

### Decision 3: `plotcandle()` produces `CandleColorEntry` with separate fields

**Chosen:** Instead of routing `plotcandle()` through the same single-color `barColorData`, it produces a `CandleColorEntry` that carries `bodyColor`, `wickColor`, and `borderColor` independently.

**Rationale:** This directly models Pine Script's `plotcandle(color=..., wickcolor=..., bordercolor=...)` semantics. When `wickcolor` or `bordercolor` are omitted, they default to the `color` value.

### Decision 4: Frontend resolves offsets on the sorted bar list

**Chosen:** After receiving bar color data, the frontend applies offsets by shifting entries forward/backward in the bar-index space before the render pass.

**Rationale:** Offsets are a rendering concern — they shift which bar a color applies to. Resolving them in the frontend avoids complexity in the runtime and API layers.

### Decision 5: Gradient colors computed at runtime, passed as hex strings

**Chosen:** `color.from_gradient()` already returns a computed hex string at the runtime level. No changes needed to the gradient computation — the existing builtin works correctly. The enhancement is purely in the transport and rendering layers to ensure per-bar gradient colors are preserved through the pipeline.

**Rationale:** The runtime already handles `color.from_gradient()` correctly. The gap was that the frontend didn't distinguish gradient colors from static colors — both are just hex strings. With `CandleColorData`, gradient results are preserved per-bar.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Increased API response size for scripts with many colored bars | `CandleColorEntry` is compact (3 optional hex strings + timestamp). For scripts that don't use multi-element coloring, only `bodyColor` is populated — same size as today. |
| Offset could push colors beyond visible range | Frontend silently clamps offsets to `[0, bars.length - 1]`. |
| Backward compatibility with existing API consumers | The `barColors` field keeps its shape but gains optional `bodyColor`/`wickColor`/`borderColor` fields. `color` remains as a backward-compatible alias for `bodyColor`. |
| Gradient coloring on every bar could be costly | Already computed per-bar at runtime; the frontend only iterates visible bars during render — no change in performance characteristics. |

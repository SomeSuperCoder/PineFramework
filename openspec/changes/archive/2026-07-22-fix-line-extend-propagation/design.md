## Context

The HHLL indicator creates S/R lines as rays (`extend.right`). When a new level forms, the old line is capped (`line.set_extend(old, extend.none)` + `line.set_x2(old, bar_index)`). The execution engine and API route correctly preserve the `extend` property, but the frontend data pipeline drops it in two mapping functions in `useChartData.ts` before the canvas renderer receives it.

Current data flow:
```
API response (has extend) → buildScriptResult (drops extend) → ScriptResult (no extend) → Renderer (defaults to 'none')
```

Desired data flow:
```
API response (has extend) → buildScriptResult (includes extend) → ScriptResult (with extend) → Renderer (draws ray)
```

## Goals / Non-Goals

**Goals:**
- Forward `extend` from API response lines through to `ScriptResult.lines`
- Add `extend` to the `ExecuteResponse` line type interface
- Handle `extend` in both initial execution (`buildScriptResult`) and real-time diff (`mergeDiffIntoResult`)
- Zero visual changes to existing behavior for indicators that don't set `extend`

**Non-Goals:**
- No changes to the engine, builtins, or API route
- No changes to diagonal-line ray rendering (only horizontal rays are extended, matching current renderer behavior)
- No changes to the `LineData` or `DrawingLineData` types (they already have `extend`)

## Decisions

### Decision 1: Forward extend explicitly rather than spreading

Rather than using object spread (`{...l}`) which could forward unexpected API fields, we explicitly list `extend` alongside the existing `points`, `color`, `width`, and `style` in both mapping functions. This is consistent with the existing pattern and prevents unintended API→renderer coupling.

### Decision 2: No type-level enforcement beyond the interface update

The `ScriptResult.lines` type (`LineData` in `types.ts`) already declares `extend?: 'none' | 'left' | 'right' | 'both'`. The `DrawingLineData` type in `chart/types.ts` also has `extend`. Adding `extend` to the `ExecuteResponse` interface is sufficient — no new types needed.

### Decision 3: No default value changes

The renderer already defaults `extend` to `'none'` via `line.extend || 'none'`. This handles legacy data gracefully without migration.

## Changes Required

### File: `frontend/src/hooks/useChartData.ts`

**Location 1 — `ExecuteResponse` interface (line ~26):**
Add `extend?: string` to the line type in the `ExecuteResponse` interface.

**Location 2 — `buildScriptResult()` (line ~168):**
Add `extend: l.extend` to the line mapping.

**Location 3 — `mergeDiffIntoResult()` (line ~594):**
Add `extend: l.extend` to the diff line mapping.

## Risks / Trade-offs

- **[Low risk]** No migration needed — `extend` defaults to `'none'` at the renderer, so existing recorded data without `extend` renders correctly
- **[Low risk]** The `extend` value `'none'` for non-ray lines matches the default, so no regressions for non-S/R indicators
- **[No risk]** The renderer's `extend === 'right'` branch draws a horizontal ray from x1 to the chart edge — correct for the HHLL use case where S/R lines are always horizontal

## Why

Chunk borders — where old data meets newly loaded scroll-back data — are a recurring source of visual bugs (infinitely extended lines, missing markers, cut-off drawing lines). Debugging them currently requires instrumenting code with console.logs or adding temporary visual markers. A dedicated debug mode with built-in chunk-border visualization would make these bugs instantly visible during development and testing, without code changes.

## What Changes

- Add a **Debug Mode toggle button** on the footer bar (bottom panel)
- When Debug Mode is ON, render **vertical rules at chunk boundaries** on the chart canvas
- When Debug Mode is ON, show **chunk metadata** (timestamps, bar count) in a small overlay
- The debug layer is purely visual — it never affects chart behavior, data, or execution
- Future debug features can be added under this mode (e.g., pivot markers, series boundary lines)

## Capabilities

### New Capabilities
- `debug-mode`: A toggleable debug mode for the chart that renders chunk borders and metadata overlays for development and testing

### Modified Capabilities

*(none)*

## Impact

- **Frontend**: `ChartComponent.tsx` — needs to accept and render debug state; `PineChart.ts` — needs a new render pass for debug overlays; new state/hook for debug mode toggle
- **Footer bar** (`footer-bar`): needs a debug toggle button
- **Scroll/re-execution** (`scroll-re-execution`): chunk metadata must be exposed so the debug renderer can draw borders at the right positions
- No backend changes required

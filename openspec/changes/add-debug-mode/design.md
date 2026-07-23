## Context

The chart uses a custom HTML5 Canvas renderer (`PineChart.ts`). Data is loaded in chunks via `useChartData`: an initial 1000-bar fetch, then 200-bar chunks on scroll-back. Each chunk prepend shifts bar indices and updates `ohlcvDataRef.current`. The cumulative prepend count is tracked in `prependCountRef`.

Currently there is no way to visualize where chunk boundaries fall. Bugs at these boundaries (extend direction, marker alignment, line cut-off) require tedious ad-hoc instrumentation. A debug mode with built-in boundary visualization would eliminate that overhead.

The footer bar (`AppToolbar.tsx`) already hosts utility toggles (Auto Scale, Go to Date, Telegram, Errors). It's the natural home for a debug toggle.

## Goals / Non-Goals

**Goals:**
- Add a "Debug" toggle button on the footer bar
- When debug mode is ON, render vertical dashed rules at chunk boundary positions on the chart canvas
- When debug mode is ON, show a small metadata overlay at each boundary (bar index, timestamp, chunk size)
- The debug layer is purely visual — never mutates chart data, indicators, or execution
- Expose chunk boundary positions from `useChartData` so the chart can render them

**Non-Goals:**
- No backend changes
- No changes to indicator execution or data loading
- No performance optimization of the debug layer (it's for development)
- No additional debug features beyond chunk borders (future work)

## Decisions

1. **Debug state lives in `App` component, passed down via props**
   - Rationale: Follows existing pattern (autoScale, telegramOpen, errorConsoleOpen all live in App and flow via props). Simple, no new context or global state needed.
   - Alternative considered: React context. Rejected because the debug state is simple (boolean) and only used by App → AppToolbar + ChartComponent.

2. **Chunk border data passed from `useChartData` as a `chunkBorders` array**
   - `useChartData` already tracks `prependCountRef` (cumulative bars prepended). On each successful `fetchOlderOHLCV`, the new cumulative count is a border position.
   - Expose `chunkBorders: number[]` from `useChartData` — an array of cumulative bar indices where chunks meet.
   - Rationale: No refactoring needed; `prependCountRef` is already maintained.
   - Alternative considered: Computing borders from `ohlcvDataRef` timestamps. Rejected because we already have the bar indices, which is what the viewport uses.

3. **Vertical rules rendered in `PineChart.renderDrawingLines`**
   - `PineChart` already has a `renderDrawingLines` method that handles `extend` logic. Adding a `renderChunkBorders` method alongside it keeps the render loop clean.
   - Chunk borders are vertical lines (from chart top to bottom) at specific bar indices, drawn as dashed bright lines (e.g., cyan `#00ffff` with 50% opacity) so they're visible but not distracting.
   - Rationale: Reuses the existing canvas render pipeline. No new DOM elements.

4. **Chunk border metadata rendered as small labels**
   - At each border, render a small text label at the top of the chart: "chunk N: +200 bars @ T" where N is the chunk number, +200 is the size, and T is the timestamp.
   - Uses the existing label rendering infrastructure in `PineChart`.

5. **Debug button style: subtle highlight when active**
   - When debug mode is OFF: normal button (matching other footer buttons)
   - When debug mode is ON: amber/orange glow (`#ff9800` border) to indicate it's active

## Risks / Trade-offs

- [**Visual noise**] Chunk borders with many small chunks (200 bars each) create many vertical lines. → Mitigation: Dashed + low opacity; only visible in debug mode; user explicitly enables.
- [**Performance**] Extra canvas draw calls in the render loop. → Mitigation: Debug layer only renders when debug mode is ON; single-pass vertical line drawing is negligible.
- [**API surface**] `useChartData` gets a new output. → Mitigation: `chunkBorders` array is small (< 50 entries) and derived from already-tracked state.

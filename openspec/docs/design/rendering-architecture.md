# Rendering Architecture

## 1. Visual Element Hierarchy

```
HTML5 Canvas Element
├── Background Layer (BackgroundRenderer)
│   ├── bgcolor() solid color fill
│   └── Background color
├── Grid Layer (GridRenderer)
│   ├── Horizontal grid lines at price scale ticks
│   └── Vertical grid lines at time scale ticks
├── Volume Layer (VolumeRenderer)
│   └── Volume bars (bottom 20% of chart)
├── Fill Layer (AreaRenderer)
│   ├── fill() between two plots (filled polygon)
│   └── fill() between hlines
├── Candlestick Layer (CandlestickRenderer)
│   ├── Candle bodies (rectangles: open-close range)
│   ├── Candle wicks (lines: high-low range)
│   └── Bar color overrides (barcolor())
├── HLine Layer (HLineRenderer)
│   └── Horizontal lines at price levels
├── Plot Layer (LineRenderer)
│   ├── Line Plots (solid, dotted, dashed)
│   ├── Stepline Plots
│   ├── Histogram Plots (vertical lines from baseline)
│   ├── Area Plots (filled below line)
│   ├── Circle Plots (small circles at data points)
│   └── Cross Plots (cross marks at data points)
├── Shape Marker Layer (MarkerRenderer)
│   ├── Arrow Up/Down (triangular pointers)
│   ├── Triangle Up/Down
│   ├── Circle, Square, Diamond
│   ├── Cross, XCross
│   └── Text labels alongside markers
├── Strategy Marker Layer (StrategyMarkerRenderer)
│   ├── Entry markers (long=green arrowUp, short=red arrowDown)
│   ├── Exit markers (above bar, colored by direction)
│   ├── Close markers (distinct from entry/exit)
│   └── Text labels (entry name, comment)
├── Drawing Layer (DrawingLineRenderer)
│   ├── Lines (line.new)
│   ├── Boxes (box.new)
│   ├── Labels (label.new)
│   ├── Tables (table.new)
│   ├── Line Fills (linefill.new)
│   └── Polylines (polyline.new)
├── Axis Layer (AxisRenderer)
│   ├── Price scale labels (right side)
│   └── Time scale labels (bottom)
└── Crosshair Layer (CrosshairRenderer)
    ├── Vertical line through hovered bar
    ├── Horizontal line at hovered price
    ├── Price/time labels on axes
    └── Data window tooltip (OHLCV + indicator values)
```

## 2. Rendering Pipeline

```
Data Change / Interaction → Dirty Flag Set → requestAnimationFrame Callback
  → Clear Canvas → Apply Coordinate Transforms → Render Layers in Order
    → Background → Grid → Volume → Fills → Candles → HLines → Plots
    → Shapes → Strategy Markers → Drawings → Axes → Crosshair
  → Swap Buffers (double buffer) → Display
```

## 3. Performance Optimization

- Double buffering via offscreen canvas to prevent flicker
- Dirty flag pattern: only redraw when state changes
- Batched canvas draw calls by style (color, lineWidth) to minimize state changes
- Path batching for line plots (single beginPath/stroke per style group)
- Viewport-based rendering with overscan buffer (only render visible bars)
- requestAnimationFrame for vsync-aligned render cycles
- DevicePixelRatio-aware rendering for HiDPI/Retina displays
- Level-of-detail (LOD) rendering for large datasets
- Object pooling for drawing objects
- Viewport-based rendering (only render visible elements)
- Throttled updates for smooth animation

## 4. Canvas Charting Library Architecture

- **Responsibility**: Render all chart elements on an HTML5 Canvas with full programmatic control over every pixel
- **Replaces**: Lightweight Charts third-party dependency
- **Architecture**:
  ```
  PineChart (main orchestrator)
  ├── CoordinateSystem (data-space ↔ pixel-space transforms)
  ├── Viewport (visible range, zoom, pan state; adjustForPrepend for scroll-preserving prepend)
  ├── LayoutManager (chart area, volume area, price scale, time scale regions)
  ├── Renderers
  │   ├── CandlestickRenderer (OHLCV bodies + wicks)
  │   ├── VolumeRenderer (volume histogram bars)
  │   ├── LineRenderer (line, stepline, dotted, dashed styles; per-bar color support)
  │   ├── AreaRenderer (fill between plots; per-bar color overlay on base polygon)
  │   ├── MarkerRenderer (shape markers: arrows, circles, squares, diamonds; unicode ▲/▼/◆ mapped to named handlers)
  │   ├── CharRenderer (text characters on bars)
  │   ├── ArrowRenderer (directional arrows for plotarrow)
  │   ├── HLineRenderer (horizontal lines)
  │   ├── BarColorRenderer (bar color overrides)
  │   ├── BackgroundRenderer (background color fills)
  │   ├── DrawingLineRenderer (drawing lines from line.new, extend modes)
  │   ├── BoxRenderer (drawing boxes/rectangles)
  │   ├── LabelRenderer (drawing labels with text, all label styles)
  │   ├── TableRenderer (floating data tables)
  │   ├── PolylineRenderer (multi-point lines)
  │   ├── LineFillRenderer (fill between two lines)
  │   ├── StrategyMarkerRenderer (entry/exit/close markers)
  │   ├── AlertMarkerRenderer (alert trigger markers)
  │   ├── GridRenderer (price/time grid lines)
  │   ├── AxisRenderer (price scale labels, time scale labels)
  │   └── CrosshairRenderer (crosshair + tooltip)
  └── InteractionHandler (mouse/touch events for zoom, pan, hover, price scale drag/zoom, time axis drag, middle-mouse pan, Ctrl+scroll fine zoom, double-click reset on price/time axes)
  ```
- **Key Features**:
  - Coordinate transformation system mapping (barIndex, price) → (x, y) pixels
  - DevicePixelRatio-aware rendering for HiDPI/Retina displays
  - Double buffering via offscreen canvas to prevent flicker
  - Dirty flag pattern: only redraw when state changes
  - requestAnimationFrame-based render loop
  - Batched canvas draw calls by style (color, lineWidth) to minimize state changes
  - Path batching for line plots (single beginPath/stroke per style group)
  - Viewport management with overscan buffer (only render visible bars)
  - Viewport adjustForPrepend(added): shifts totalBars and firstBarIndex when bars are prepended, preserving visible content without scroll jump
  - beginUpdate/endUpdate batch API to defer rendering until multiple indicator/data updates are complete
  - Configurable bar spacing (pixels per bar) for zoom
  - Automatic price scale tick calculation
  - Multiple price scales (main + volume)
  - Momentum-based inertial scrolling
  - Manual and auto price range modes: auto (computed from visible candles/plots), manual (set by user drag or shift+wheel)
  - Vertical zoom on price scale via Shift+scroll-wheel, centered on cursor position
  - Vertical zoom on price scale via click-and-drag on the price scale area (scales range centered on cursor)
  - Double-click to reset to auto price range and fit content
  - Ctrl+scroll wheel (Cmd+scroll on Mac) for fine-grained horizontal zoom with reduced zoom factor
  - Middle mouse button (or mouse wheel press) drag for free panning — unrestricted horizontal/vertical movement without affecting price scale auto-range mode
  - Time axis drag: dragging the bottom time scale area horizontally compresses/expands the time scale (bar spacing) for time-axis-only zoom
  - Double-click time axis to reset bar spacing and fit all data
  - Double-click price scale to reset to auto price range and fit content
  - Price range computation filters non-finite and near-zero plot values to prevent chart distortion
  - Price range clamped to at most 10x candle range to prevent excessive scaling when plot values exceed candle prices
  - Indicator panes have independent price scales rendered on the right side with per-pane tick labels
  - Indicator pane rendering clipped to allocated regions via canvas clipping to prevent bleed-through
  - Horizontal separator lines between indicator panes and between volume area and indicator panes
  - Per-bar plot color rendering for line, stepline, histogram, columns styles
  - Per-bar fill color overlay: when fillColorData exists, skip the base fill polygon entirely and draw only per-bar color segments with their actual colors to prevent base polygon color bleeding through transparent segments
  - Drawing line rendering (solid, dotted, dashed, extend modes: none/left/right/both)
  - Label rendering (rounded boxes, all label styles, configurable text/background/border colors)
  - Box rendering (filled rectangles with configurable border_color and bgcolor, rendered on layer above drawing lines)
  - ResizeObserver for responsive container handling
  - Event system: onCrosshairMove, onVisibleRangeChange, onResize, onPriceRangeChange
- **API**:
  - `createChart(container, options)` → chart instance
  - `chart.setCandles(data)`, `chart.setVolume(data)`
  - `chart.addPlotSeries(name, options)` → series handle
  - `chart.setMarkers(markers)`, `chart.setFills(fills)`, `chart.setLines(lines)`, `chart.setLabels(labels)`, `chart.setHLines(hlines)`, `chart.setDrawingLines(drawingLines)`, `chart.setBoxes(boxes)`
  - `chart.removeSeries(name)`
  - `chart.timeScale()` → { fitContent(), scrollTo(), scrollToDate() }
  - `chart.applyOptions(options)`, `chart.remove()`
  - `chart.beginUpdate()`, `chart.endUpdate()` — batch update batching
  - Events: onCrosshairMove, onVisibleRangeChange, onResize, onPriceRangeChange
- **Rendering Layers** (back to front):
  1. Background (bgcolor)
  2. Grid lines
  3. Volume bars
  4. Fill areas (base polygon + per-bar color overlay segments)
  5. Candlesticks
  6. Bar color overrides (barcolor)
  7. Horizontal lines (hline)
  8. Line plots (line, stepline, circles, cross, histogram, columns; with per-bar color support)
  9. Area plots (area, areabr)
  10. Drawing lines (line.new objects, solid/dotted/dashed, extend modes)
  11. Boxes (box.new objects)
  12. Polylines (polyline.new objects)
  13. Linefills (linefill.new objects)
  14. Shape markers (plotshape)
  15. Character markers (plotchar)
  16. Directional arrows (plotarrow)
  17. Drawing labels (label.new objects, all styles)
  18. Strategy markers (entry/exit/close)
  19. Alert markers (alert trigger points)
  20. Axes (price scale, time scale)
  21. Crosshair + tooltip
  22. Tables (floating data tables, rendered as overlay)
  - **Clipping**: Candlesticks, overlay plots, and fills are clipped to `chartArea` using canvas clip regions; volume bars are clipped to `volumeArea`; indicator pane plots are clipped to their respective pane regions — preventing any visual bleed-through between panes

## 5. Index-Based Renderer Positioning

### 5.1 Overview
All chart renderers (LineRenderer, AreaRenderer) use direct index-based positioning instead of time-based `findBarIndex()` matching. Since plot data and candle data maintain a 1:1 index correspondence in the data pipeline, using the data index directly as the bar index eliminates O(n²) time-based scanning and prevents visual discontinuities during forming candle updates.

### 5.2 Index-Based Rendering
- **LineRenderer**: For each plot data point at index `i`, uses `i` directly as the bar index for pixel positioning via `indexToPixel(i)`
- **AreaRenderer**: Same approach — fill polygon vertices use data index `i` directly as the bar index
- **No findBarIndex()**: The time-based `findBarIndex(candles, time)` helper is NOT used for plot rendering; it was removed to prevent O(n²) performance and visual discontinuities

### 5.3 Why Index-Based Over Time-Based
- **1:1 correspondence guarantee**: Plot data and candle data are always the same length in the data pipeline; each plot data point at index `i` corresponds to the candle at the same index
- **No index drift**: The data pipeline ensures candle data and indicator data are aligned by construction — no time-matching needed
- **Forming candle support**: When forming candle data is appended to existing data arrays, the 1:1 correspondence is preserved by design
- **Performance**: Eliminates O(n²) time-based scanning per render cycle
- **Simplicity**: Direct index access is simpler and more predictable than time-based matching

## 6. Forming Candle Color Updates

### 6.1 Overview
The forming candle computation must produce correct bgcolor, fillColorData, and plotColors diffs. Previously, these diffs were computed before restoring the pre-execution state, resulting in empty diffs because the restored state matched the snapshot. The fix moves the restoration to AFTER diff computation.

### 6.2 Diff Computation Order
```
1. Execute script for forming candle
2. Compute bgcolor diff (newBgcolorData vs this.bgcolorData)
3. Compute fillColorData diff (newFillColorData vs this.fillColorData)
4. Compute plotColors diff (newPlotColors vs this.plotColors)
5. Restore pre-execution state (barTimestamps, outputSeriesLength)
6. Apply diffs to the forming candle result
```

### 6.3 Why This Order Matters
- Before the fix: restoration happened at step 1, making all diffs perpetually empty (restored state matched snapshot)
- After the fix: restoration happens at step 5, so diffs capture actual changes during forming candle execution
- This ensures bgcolor, fill, and plot color changes are correctly reflected on the forming candle

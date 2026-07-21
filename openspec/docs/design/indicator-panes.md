## Indicator Pane Architecture

### 1. Overview

In TradingView, the `overlay` parameter in `indicator()` determines whether an indicator renders on the main price chart (`overlay=true`) or in a separate pane below (`overlay=false`, the default). Non-overlay indicators like MACD, RSI, and Stochastic have their own Y-axis scale and are displayed below the main chart.

### 2. Data Flow

```
Script Declaration (indicator(..., overlay=false))
  -> Parser: scriptArgs parsed
  -> Compiler: overlay extracted into CompiledScript.overlay
  -> Engine: overlay included in ExecutionResult.overlay
  -> Backend: overlay included in API/WebSocket response
  -> Frontend: plots separated into overlay[] vs indicator[] arrays
  -> PineChart: non-overlay plots rendered in separate indicator pane with own price scale
```

### 3. IR Changes

```
CompiledScript {
  ...existing fields...
  overlay: boolean  // NEW: extracted from indicator() declaration args
}
```

### 4. Layout Changes (LayoutManager)

```
+----------------------------------+
|  Main Chart Area (overlay=true)  |  <- candlesticks, volume, overlay plots
|  Height: flexible base            |
+----------------------------------+  <- horizontal separator
|  Indicator Pane 1 (e.g., MACD)   |  <- own Y-axis price scale, own plots
|  Height: equal share of remaining |
+----------------------------------+  <- horizontal separator
|  Indicator Pane 2 (e.g., RSI)    |  <- own Y-axis price scale, own plots
|  Height: equal share of remaining |
+----------------------------------+  <- separator (if more panes)
|  ... (additional panes)          |
+----------------------------------+
|         Time Scale (shared)       |
```

Each non-overlay indicator gets its own pane with:
- Independent Y-axis price scale computed from that indicator's output values
- Its own coordinate space for `priceToPixel()` / `pixelToPrice()` transforms
- Its own canvas clip region to prevent visual bleed-through between adjacent panes

`LayoutManager.calculate()` receives the list of non-overlay indicators and allocates vertical space accordingly:
- The main chart area gets a flexible base height (typically 60-80% of available)
- Remaining vertical space is divided equally among N indicator panes
- Dynamic adjustment: when an indicator is added or removed, `recalculateLayout()` redistributes space

### 5. PineChart Changes

- `updatePriceRange()` splits into `updateOverlayPriceRange()` and per-pane `updateIndicatorPriceRange(paneId)`
- Each non-overlay indicator's plots use its own pane's coordinate space for `priceToPixel()`
- LineRenderer, AreaRenderer, and HLineRenderer accept a target pane's Y coordinates
- Separate price scale rendering for each indicator pane via `AxisRenderer.renderIndicatorScale(paneIndex)`
- `recalculateLayout()` detects overlay count changes (new plot series added/removed) and triggers `resize()` to re-allocate pane space across all panes
- Canvas clipping via `ctx.save()`/`ctx.clip()`/`ctx.restore()` restricts candlestick and overlay plot rendering to the `chartArea` and volume rendering to the `volumeArea`, preventing visual bleed-through into indicator panes below
- **Indicator Pane Autoscale on Scroll**: When the viewport changes (scroll, pan, or zoom), each indicator pane recomputes its visible price range from the min/max of its indicator values within the current visible bar range. The autoscale fires after every `onVisibleRangeChange` event. For each indicator pane, the engine filters the output series to only bars within the visible range, computes `min`/`max`, and applies a small vertical padding margin (e.g., 5%). This replaces the previous static price range and forces a re-render of the pane's Y-axis and plot positions. Manual price range overrides are ignored for indicator panes - they always autoscale.

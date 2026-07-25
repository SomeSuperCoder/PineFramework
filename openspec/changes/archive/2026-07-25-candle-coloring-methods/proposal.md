## Why

The engine has basic `barcolor()` and `plotcandle()` runtime builtins, but the frontend CandlestickRenderer only applies a flat single-color override per candle. Test indicator scripts leverage advanced candle coloring patterns — gradient-based coloring, multi-element wick/body/border styling, and user-configurable bull/bear color schemes — that either render incorrectly or are entirely ignored. Closing this gap is required for visual compatibility with the test_indicators suite.

## What Changes

- Extend `CandlestickRenderer` to support multi-element candle coloring (separate body, wick, border colors per candle)
- Add gradient candle coloring support from the engine through to the frontend
- Extend the engine `barcolor()` builtin to support the `offset` parameter
- Add a `CandleColorDescriptor` type to the rendering types to carry per-candle multi-color data
- Wire `plotcandle()` through the runtime → backend → frontend pipeline with proper per-element colors
- Ensure all 7 test_indicators scripts that color candles produce visually correct output

## Capabilities

### New Capabilities
- `multi-element-candle-coloring`: Support separate body, wick, and border colors per candle in the rendering pipeline
- `gradient-bar-coloring`: Support gradient-based bar/candle coloring (`color.from_gradient`) from script to screen
- `barcolor-offset`: Support the `offset` parameter in `barcolor()` for shifted bar coloring

### Modified Capabilities
- `plotting-visualization`: Extend `barcolor()` and `plotcandle()` requirements to cover per-element coloring, gradient support, and offset parameter
- `color-system`: No requirement changes — existing gradient and color manipulation functions are sufficient

## Non-goals

- Adding new Pine Script color functions (e.g., no new `color.*` API beyond what's already implemented)
- Changing the OHLC candle rendering layout or bar spacing logic
- Implementing `plotcandle()` as a first-class named plot output (it remains a convenience that routes to bar colors)

## Impact

- `src/rendering/rendering-types.ts` — new `CandleColorDescriptor` type
- `src/rendering/plot-engine.ts` — extend `barcolor()` with offset; add candle color data structure
- `src/language/runtime/builtins/plot-builtins.ts` — enhance `plotcandle()` and `barcolor()` builtins
- `frontend/src/chart/renderers/CandlestickRenderer.ts` — support per-element multi-color rendering
- `frontend/src/chart/PineChart.ts` — accept richer candle color data
- `backend/src/routes/execute.ts` — pass enhanced candle color data in API response
- `openspec/specs/plotting-visualization/spec.md` — updated requirements

## Why

Indicators that require a lookback period (e.g., `ta.sma(src, 50)`) produce incorrect results when executed on candles where insufficient historical data exists. Currently, scripts run on all visible candles regardless of whether their lookback requirements are met, causing labels and plots to stack on the oldest candle where the script has only partial data. This creates visual artifacts and incorrect signal generation for historical data chunks.

## What Changes

- Add lookback-aware execution gating: scripts shall not execute on candles where their lookback period is unsatisfied
- Maintain uncalculated state for candles with unsatisfied lookback until subsequent chunks load additional history
- Preserve existing chunk-boundary rendering fixes (no regression)
- Add a `bar_index < lookback_length` guard to script execution pipeline

## Capabilities

### New Capabilities
- `lookback-gating`: Controls script execution based on whether lookback requirements are satisfied for each candle

### Modified Capabilities
- `progressive-computation`: Add lookback-awareness to progressive computation logic
- `execution-engine`: Gate script execution on lookback satisfaction

## Impact

- **Code**: `src/execution/` - script runner must check lookback before executing
- **Code**: `src/progressive/` - chunk computation must track lookback state
- **Rendering**: Oldest candle in a chunk may show no labels/plots until next chunk loads
- **Performance**: Minimal - adds a simple length check per candle

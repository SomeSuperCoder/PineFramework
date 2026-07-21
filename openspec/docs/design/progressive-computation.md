## Progressive Indicator Computation Architecture

### 1. Overview

The Progressive Indicator Computation system replaces the previous "compute everything upfront" model with a lazy/progressive architecture. Indicators are computed only for the currently visible viewport (plus lookback seed data) rather than the entire dataset. As the user scrolls, indicator values are computed in small batches, making the experience feel hyper-smooth and continuous - as if the values were always there.

### 2. Key Concepts

- **Lookback Period**: Each indicator requires a certain number of seed candles before its first valid output (e.g., 20 for a 20-period EMA). The system determines the maximum lookback across all running indicators and pre-loads that many candles before the visible range.
- **Visible Viewport**: The set of candle indices currently visible in the chart canvas. Only this range plus lookback needs computation.
- **Progressive Batches**: When the user scrolls to reveal new candles, the system computes indicator values in small batches (e.g., 10-50 candles per batch) to avoid frame drops.
- **Interruptible Computation**: In-flight batch computation can be cancelled if the user scrolls to a different region; the new region takes priority.
- **Instant Catch-Up**: If progressive loading falls behind (user scrolls faster than computation), the missing range is computed immediately in a single high-priority pass.

### 3. Pipeline

```
1. Initial Load:
   a. Determine max lookback L across all running indicators
   b. Load L + visibleRange candles from data source
   c. Compute indicator values for visibleRange using L seed bars
   d. Render computed values on chart

2. Scroll (backward or forward):
   a. Detect newly visible candles outside the computed range
   b. Enqueue a progressive computation batch for those candles
   c. Compute in small batches (10-50 candles) across animation frames
   d. Append/prepend results to the indicator data arrays
   e. Re-render chart with updated data

3. Priority Queue:
   - Immediate priority: forming candle tick updates
   - High priority: user-scrolled-to region (instant catch-up if needed)
   - Low priority: pre-compute regions near the viewport (prefetching)

4. Realtime Forming Candle:
   a. On each market tick or kline update: recompute indicator values for index 0 (forming candle) only
   b. Merge new values into the indicator data array
   c. Trigger chart re-render for the forming candle region

5. Indicator Add/Remove:
   a. On add: determine lookback, load seed data, compute visible range
   b. On remove: clear data, cancel any in-flight computation for that indicator
```

### 4. Lookback Seed Data Management

For each indicator, the system tracks:
- **Required seed count**: The maximum period used by any built-in or custom function (e.g., `ta.sma(close, 20)` -> seed count = 20)
- **Current seed buffer**: The pre-visible candle data loaded for this indicator
- **Is seeded**: Whether enough data has been loaded to produce a valid first output

When computing a batch, the system ensures the first computed bar has access to its seed bars. If the visible range shifts to include bars that are not yet seeded, the system loads additional historical data from the backend before computing.

### 5. Interruptible Batch Queue

```
BatchQueue:
  - pending: Batch[] (ordered by position, oldest first)
  - inProgress: Batch | null
  - priority: 'immediate' | 'scroll' | 'prefetch'

  enqueue(range, priority):
    - Cancel any inProgress batch with lower priority
    - Dequeue pending batches that overlap with the new range
    - Add new batch to front of queue

  processNext():
    - If inProgress is not null, skip (wait for completion)
    - Dequeue highest-priority pending batch
    - Compute indicator values for batch range
    - Merge results into indicator data arrays
    - Trigger chart re-render
```

### 6. Frontend Integration

- **ChartComponent** watches `onVisibleRangeChange` to detect viewport shifts
- On viewport change: compute which bars are new (outside current computed range), enqueue progressive computation
- **useChartData** stores per-indicator computed data arrays with metadata (computed range, seed state, isStale)
- **useIndicatorData** is a new hook managing the progressive computation lifecycle for all running indicators
- The rendering pipeline (add all, remove stale) remains unchanged - it consumes the computed arrays from useIndicatorData

### 7. Backend Integration

- Backend exposes a `GET /api/bars?range={fromIndex,toIndex}&symbol={symbol}&timeframe={timeframe}` endpoint for fetching raw OHLCV bar data by index range
- Indicator computation can happen either on the backend (for complex indicators) or on the frontend (for simple indicators) - the architecture supports both via a computation worker abstraction
- Seed data is fetched once during indicator add and cached; subsequent scroll-based computations reuse the same data source

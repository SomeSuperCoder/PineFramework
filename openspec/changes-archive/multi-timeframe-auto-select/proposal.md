## Why

The auto-select feature currently only tests 1-hour timeframes. Different strategies perform better on different timeframes (e.g., scalping on 5m, swing on 4h). Users need to:
1. Test across multiple timeframes (5m, 15m, 1h, 4h, etc.)
2. Select which pairs and timeframes to include/exclude
3. See which timeframe+pair combination performs best

## What Changes

- Add configurable list of timeframes to auto-select (default: 5m, 15m, 1h, 4h)
- Add UI to toggle timeframes on/off in the backtest step
- Update candidate generation to create pairs × timeframes combinations
- Show timeframe in the AutoSelectGrid alongside pair
- Persist user's timeframe preferences

## Capabilities

### New Capabilities

(none — this is enhancement of existing feature)

### Modified Capabilities

(none)

## Impact

- **Files affected**:
  - `src/trading/auto-select.ts` — `DEFAULT_CANDIDATES` generation, `computeCandleCount`
  - `frontend/src/components/TradingBotPanel.tsx` — AutoSelectGrid, BacktestStep UI
  - `backend/src/index.ts` — `defaultCandidates` generation
- **API**: No breaking changes, just more candidates in auto-select

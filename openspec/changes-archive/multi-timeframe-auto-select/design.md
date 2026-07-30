## Context

The auto-select feature evaluates multiple trading pairs to find the best one. Currently it only tests 1-hour timeframe for all pairs. Users need multi-timeframe support to find optimal timeframe for their strategy.

## Goals / Non-Goals

**Goals:**
- Support multiple timeframes (5m, 15m, 1h, 4h)
- Allow users to toggle timeframes on/off
- Show timeframe in results grid
- Persist user preferences

**Non-Goals:**
- Custom timeframe input (use preset list)
- Timeframe-specific strategy parameters
- Parallel backtesting across timeframes

## Decisions

### Decision 1: Use preset timeframe list

**Options:**
- A) Preset list: [5m, 15m, 1h, 4h]
- B) Custom input with validation
- C) Slider/range selector

**Choice: Option A** — Preset list

**Rationale:** Simpler UI, fewer errors, covers most use cases. Custom input adds complexity without significant benefit.

### Decision 2: Generate candidates as pairs × timeframes

```typescript
const pairs = ['BTCUSDT', 'ETHUSDT', ...];
const timeframes = ['5', '15', '60', '240'];
const candidates = pairs.flatMap(pair => 
  timeframes.map(tf => ({ symbol: pair, timeframe: tf }))
);
```

**Rationale:** Flat list is easier to process sequentially. Each candidate is independent.

### Decision 3: Store preferences in localStorage

**Rationale:** Simple persistence, no backend changes needed. Preferences are user-specific, not account-specific.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| More candidates = longer backtest time | Show estimated time, allow cancel |
| 5m timeframe needs more bars | computeCandleCount already handles this |
| UI clutter with many pairs | Collapsible sections, select all/none |

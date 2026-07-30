## Context

Current auto-select runs all pairs in parallel with a single "Evaluating Pairs (X/Y)" progress bar. The backtest engine limits to 1500 bars per run. Each timeframe converts this limit differently:
- 60m: 1500 candles = 1500 hours = 62.5 days
- 240m: 1500 candles = 6000 hours = 250 days (capped at 90 days = 540 candles)

## Goals / Non-Goals

**Goals:**
- Sequential backtest execution (one pair at a time)
- Per-pair progress bar showing candle fetch progress
- Candle count formula: `min(1500, floor(90_days / timeframe_hours))`
- Clear visual feedback for each pair's backtest status

**Non-Goals:**
- Parallel execution (explicitly deferred)
- Changing the 1500 bar limit
- Modifying the backtest engine

## Decisions

### D1: Sequential execution with per-pair progress

**Decision**: Run backtests one at a time. Each pair shows:
1. "Fetching candles..." with progress (0/540)
2. "Backtesting..." (indeterminate)
3. "Done" or "Failed"

**Rationale**: Simpler debugging, clearer progress, no API rate limit issues.

### D2: Candle count formula

**Decision**: `candles = min(1500, floor(90_days * 24 / timeframe_hours))`

Examples:
- 60m: min(1500, floor(2160)) = 1500
- 240m: min(1500, floor(540)) = 540
- 15m: min(1500, floor(8640)) = 1500

### D3: Progress event shape

**Decision**: Extend progress callback to include per-pair candle progress:
```typescript
{
  current: number;       // completed pair index
  total: number;         // total pairs
  pair: PairConfig;      // current pair
  phase: string;         // 'fetching' | 'backtesting'
  statuses: Record<string, CandidateStatus>;
  candleProgress?: {     // new: per-pair candle progress
    fetched: number;
    total: number;
  };
}
```

### D4: AutoSelectGrid with progress bars

**Decision**: Each row in `AutoSelectGrid` shows a mini progress bar during fetching phase.

## Risks / Trade-offs

- **[Risk]** Slower total execution (sequential) → **Mitigation**: Acceptable for now; parallel can be re-enabled later
- **[Risk]** More progress events → **Mitigation**: Throttle to ~10 events/second max

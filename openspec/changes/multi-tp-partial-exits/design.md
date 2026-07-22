## Context

The strategy engine (`src/strategy/strategy-engine.ts`) already supports partial exit sizing — calling `exit(qty=N)` reduces the position by N and records a `Trade` for that partial quantity. However, there is no mechanism to group multiple exit orders so that when one fills, the others cancel. Additionally, the `strategy.exit()` builtin in `src/language/runtime/builtins/strategy-builtins.ts` only passes through basic `qty`, `stop`, and `limit` — missing the richer parameter set TradingView supports (`profit`, `loss`, `qty_percent`, `from_entry`, trailing stops).

The existing `Order` interface already has an `ocaGroup?: string` field (unused). The `Position` tracks a single `entryName` string, overwritten on pyramid adds — no composition tracking.

## Goals / Non-Goals

**Goals:**
- OCA grouping: exit orders from the same entry are grouped; filling one cancels the rest
- `profit`/`loss` tick-based exit parameters in `strategy.exit()`
- `qty_percent` parameter for percentage-based exit sizing
- `from_entry` parameter to target specific entries when pyramiding
- Trailing stop via `trail_price` and `trail_offset` parameters
- Trailing state persistence across bars
- Full test coverage for all new behaviors

**Non-Goals:**
- Not implementing `strategy.exit()` parameter combinations for every edge case that TradingView supports (e.g., not doing `limit` + `profit` conflict resolution — we use whichever triggers first)
- Not refactoring the entire order model — changes are additive
- Not adding frontend/UI for multi-level exits (separate change)

## Decisions

### Decision 1: OCA Group ID Strategy

**Approach:** Generate OCA group IDs from the entry name. When `exit()` is called and a position is open, any new non-market exit order joins the OCA group for that entry name. If the entry name changes (new entry replaces old), the OCA group is reset.

**Why:** Simple, deterministic, no extra state. The `Order.ocaGroup` field already exists. Grouping by entry name naturally separates exits from different pyramiding levels.

**Alternative considered:** UUID per group — more flexible but unnecessary since exits naturally belong to the entry that created them.

```
OCA Group ID = "oca_" + entryName
```

### Decision 2: OCA Cancellation Timing

**Approach:** In `processPendingOrders()`, after filling any order, scan remaining pending orders and cancel those sharing the same OCA group. This happens once per bar (or sub-bar with magnification) after each fill.

**Why:** Simple, single-pass, no async coordination. Since backtesting is synchronous, cancellation is immediate.

```
processPendingOrders():
  for each fillable order:
    fill it
    cancel all other orders in same OCA group
```

### Decision 3: Profit/Loss Tick Parameter Resolution

**Approach:** The `strategy.exit()` builtin receives `profit` and `loss` as tick counts. At the builtin layer (before calling the engine), resolve them to absolute prices:

```
limitPrice = position.avgPrice + profit * syminfo.mintick  (long)
stopPrice  = position.avgPrice - loss * syminfo.mintick    (long)
```

For `profit` + `limit` both specified, `profit` is converted to a price and the lower (for long) is used (TV behavior).

**Why:** Resolution is a PineScript semantic concern, not an engine concern. The engine already works with absolute prices. This keeps the engine clean.

**Concern:** Need access to `syminfo.mintick` in the builtin layer. This is already available via the execution engine's context.

### Decision 4: Qty Percent Resolution

**Approach:** Resolve `qty_percent` to absolute quantity at the builtin layer:

```
quantity = floor(position.quantity * qty_percent / 100)
```

**Why:** Same rationale as Decision 3 — the engine deals in absolute quantities. Percentage is a UI/PineScript convention.

### Decision 5: From Entry — Position Composition Tracking

**Approach:** Track position as a FIFO queue of entry lots. Each `entry()` call adds a lot record `{ entryName, quantity, avgPrice }`. When an exit with `from_entry` is called, only close from matching lots. When an exit without `from_entry` is called, close from the oldest lots first (FIFO).

```
interface PositionLot {
  entryName: string;
  quantity: number;
  avgPrice: number;
  timestamp: number;
  barIndex: number;
}
```

Update `Position` to include `lots: PositionLot[]`. The existing `quantity` and `avgPrice` fields become computed aggregates from `lots`.

**Why:** FIFO matches TradingView behavior and is the standard for position accounting. Per-lot tracking enables `from_entry` by matching lot entryName.

**Alternative considered:** Percentage allocation (split exits proportionally across all entry lots) — simpler but doesn't match TV semantics where `from_entry` exits exact amounts.

### Decision 6: Trailing Stop State

**Approach:** Add a `trailingStops` map to `StrategyEngine` keyed by order ID:

```
interface TrailingStopState {
  orderId: string;
  trailPrice: number;      // absolute offset from market
  trailOffset: number;     // ticks offset from highest
  highestPrice: number;    // highest seen since activation
  activationPrice: number; // price at which trailing activates
  stopPrice: number;       // current stop price
  isActivated: boolean;
}
```

In `updateBar()`, after `processPendingOrders()`:
1. For each active trailing stop, check activation
2. If activated, update `highestPrice` from current bar's high/low
3. Recompute `stopPrice = highestPrice - trailOffset` (or `market - trailPrice`)
4. If the new stop price is higher than the existing stop, update the pending order's `stopPrice`

**Why:** Separating trailing state from the Order struct keeps Order lean. The trailing stop state is ephemeral — only needed during the position's lifetime.

### Decision 7: Modified processPendingOrders Flow

**Current flow:**
```
updateBar() → fillPendingMarketOrders() → processPendingOrders() → updatePositionPnL()
```

**New flow:**
```
updateBar() → fillPendingMarketOrders()
           → updateTrailingStops() [NEW]
           → processPendingOrders() [with OCA cancellation]
           → updatePositionPnL()
```

`updateTrailingStops()` runs before `processPendingOrders()` so that trailing stop prices are current for the bar's price action before order processing.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        updateBar()                               │
│                                                                   │
│  1. fillPendingMarketOrders(open, high, low, close)              │
│                                                                   │
│  2. updateTrailingStops(high, low)          ← NEW                │
│     ┌──────────────────────────────┐                             │
│     │ For each active trailing     │                             │
│     │ stop, update stopPrice from  │                             │
│     │ current bar's high/low       │                             │
│     └──────────────┬───────────────┘                             │
│                    │                                              │
│  3. processPendingOrders(high, low)    ← MODIFIED (OCA cancel)   │
│     ┌──────────────────────────────┐                             │
│     │ For each fillable order:     │                             │
│     │   fillOrder(order)           │                             │
│     │   cancel siblings in OCA     │                             │
│     └──────────────────────────────┘                             │
│                                                                   │
│  4. updatePositionPnL(close)                                     │
│                                                                   │
│  5. updateTradeExcursion(high, low)    ← EXISTS, unchanged       │
└──────────────────────────────────────────────────────────────────┘
```

## Data Model Changes

### Position (modified)
```
interface Position {
  // Existing fields remain
  symbol: string;
  direction: PositionDirection;
  quantity: number;        // computed: lots.reduce(sum, l => l.quantity)
  avgPrice: number;        // computed: weighted average of lots
  // ... existing fields ...
  
  // NEW
  lots: PositionLot[];     // FIFO queue of entry lots
}
```

### Order (existing — OCA group already present)
```
interface Order {
  // ... existing fields ...
  ocaGroup?: string;  // ← already exists, now actually used
}
```

### TrailingStopState (new interface)
```
interface TrailingStopState {
  orderId: string;
  trailPrice?: number;
  trailOffset?: number;
  highestPrice: number;
  stopPrice: number;
  isActivated: boolean;
}
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| OCA cancellation after every fill is O(n²) in worst case | In practice, strategies have 2-5 exit orders per entry. O(n²) is negligible. If it becomes an issue, batch fills then cancel once. |
| FIFO lot tracking adds memory per bar for large pyramiding | Each lot is ~40 bytes. At max pyramiding=10, overhead is trivial. |
| Trailing stop creates per-bar mutation of pending orders | Already happens with market fill processing. Adding trailing updates to the same loop is consistent. |
| `from_entry` with partial fills could create odd lot sizes | Fractional quantities already supported. Floor division prevents sub-tick quantities. |
| `profit`/`loss` ticks need `syminfo.mintick` which varies per symbol | Builtin layer has access to execution context which includes bar/symbol info. Hard-code a default mintick of 0.01 for test compatibility. |
| Trail price vs trail offset interaction is complex in TV | Implement simplest version: `trail_offset` is primary, `trail_price` can set custom activation distance. |

## Open Questions

1. Should `from_entry` respect pyramiding count? (i.e., if pyramiding=0, `from_entry` is a no-op since only one entry exists)
   → Decision: Yes. With pyramiding=0 (default), `from_entry` is ignored since only one entry exists.
2. Should trailing stops persist across bar gaps? (e.g., weekend gaps)
   → Decision: Yes. The stop updates every bar based on that bar's price action.
3. What happens when `profit` and `limit` are both specified?
   → Decision: Use the lower limit (for long) / higher limit (for short) — matches TV behavior of "whichever triggers first."

## Context

The backtest settings panel (`BacktestGeneralSettings.tsx`) currently enforces data safety via:

- **`MAX_BARS = 1500`** — hardcoded constant.
- **`BARS_PER_DAY: Record<string, number>`** — a static lookup table mapping timeframe strings (e.g., `'1'`, `'5'`, `'D'`, `'W'`) to their candle count per day.
- **`getMaxDays(timeframe)`** — divides `MAX_BARS` by the lookup value.
- **`estimateBars(timeframe, days)`** — multiplies bars-per-day by selected days.

The problem: the `BARS_PER_DAY` table must be manually kept in sync with any new timeframe added to the system (the `Timeframe` type in `src/data/bar.ts` supports 18+ timeframes, but `BARS_PER_DAY` only covers 8). Additionally, the days-back input is a plain `NumberInput` with `min={1}` — it doesn't visually communicate the safe range to the user.

The existing utility `timeframeToMinutes()` in `src/data/bar.ts` already parses any valid timeframe string into minutes, making algorithmic candle-per-day calculation possible without a lookup table.

## Goals / Non-Goals

**Goals:**
- Replace `MAX_BARS` with a shared constant `SAFE_AMOUNT_OF_CANDLES` (same default: 1500).
- Replace `BARS_PER_DAY` lookup with an algorithmic function `candlesPerDay(timeframe)` using `timeframeToMinutes()`.
- Replace the days-back `NumberInput` with a slider bounded to `[30%, 100%]` of the safe candle limit expressed in days.
- Export the constants and utilities from a shared module importable by both frontend components and (future) backend enforcement.
- Keep the existing bar-estimate warning display and "Run Backtest" disable behavior intact.

**Non-Goals:**
- No backend-side limit enforcement (the server already limits data; this change is purely about frontend UX + shared constants).
- No change to the traditional (start/end date) date range mode.
- No change to the `SAFE_AMOUNT_OF_CANDLES` default value (1500). Tuning is a separate concern.
- No new UI framework dependencies — the slider will use a native `<input type="range">` styled to match the existing theme.

## Decisions

### Decision 1: Algorithmic candle-per-day calculation over lookup table
**Chosen**: `candlesPerDay(tf) = (24 * 60) / timeframeToMinutes(tf)`, with special cases for `'D'` (returns 1) and `'W'` (returns `1/7`).

**Rationale**: `timeframeToMinutes()` already exists and correctly handles all 18+ timeframe variants (including compound ones like `'3M'`). No manual table maintenance needed. The special cases for D/W are necessary because they represent human time units rather than fixed-minute intervals (a day always has 1 daily candle; a week always has 1/7 of a daily candle).

**Alternatives considered**:
- *Keep lookup table and expand it* — rejected because it would require updates whenever a new timeframe is added to `Timeframe`, creating a maintenance trap.
- *Use the server-side `parseTimeframe()` directly in the frontend* — rejected because it adds a dependency on the backend package; instead we'll use the existing `timeframeToMinutes()` which is already in a shared package or can be imported.

### Decision 2: Slider instead of NumberInput for days back
**Chosen**: Replace the `NumberInput` in "days back" mode with an `<input type="range">` slider.

**Rationale**: A slider communicates the safe range visually — the user can see where they are relative to the limit. The bounds are computed as:
- `maxSafeDays = Math.floor(SAFE_AMOUNT_OF_CANDLES / candlesPerDay(timeframe))`
- `minDays = Math.ceil(0.3 * maxSafeDays)`

The minimum of 30% ensures a meaningful backtest (at least some data) while the maximum prevents system overload.

**Alternatives considered**:
- *Keep NumberInput with dynamic min/max props* — rejected because it doesn't visually communicate range and makes it easy to overshoot.
- *Styled slider from a UI library* — rejected to avoid dependency bloat; native input with CSS is sufficient.

### Decision 3: Shared utility module location
**Chosen**: Create `frontend/src/utils/candleLimit.ts` exporting:

```typescript
export const SAFE_AMOUNT_OF_CANDLES = 1500;
export function candlesPerDay(timeframe: string): number;
export function maxSafeDays(timeframe: string): number;
export function estimateBars(timeframe: string, days: number): number;
export function sliderBounds(timeframe: string): { min: number; max: number };
```

**Rationale**: The frontend is the primary consumer. If the backend later needs these bounds, the module can be extracted to the shared workspace package. For now, colocation with the consuming component keeps things simple and follows the existing pattern (e.g., `extractStrategyParams.ts` in `frontend/src/utils/`).

### Decision 4: Reuse `timeframeToMinutes` via import
**Chosen**: Import `timeframeToMinutes` from the root `pine-framework` package (or duplicate the algorithm if cross-package import is impractical).

**Rationale**: The function is pure and small. If the frontend build can resolve `pine-framework` as a workspace dependency, we import it directly. Otherwise we re-implement the minute calculation inline (the logic is `MINUTES_IN_DAY / parseInt(timeframe)` for minute-based timeframes with D/W special cases).

## Risks / Trade-offs

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Slider value precision: days are integers, but candle calculations may produce fractional days | Low | Use `Math.floor` for max and `Math.ceil` for min to produce clean integer bounds |
| `timeframeToMinutes` import unavailable from frontend | Medium | Fall back to inline calculation — the algorithm is `(24 * 60) / tfMinutes` with D/W edge cases, ~10 lines of code |
| Existing saved `daysBack` value exceeds new slider max on timeframe change | Low | Clamp `daysBack` to `sliderBounds().max` when timeframe changes, using a `useEffect` or a `key` on the slider |
| User confusion from slider replacing number input | Low | Show the numeric value as a label beside the slider thumb, matching the existing display pattern |
| New timeframe formats (e.g., seconds `'S'` or months `'M'`) produce extreme candle counts | Low | `candlesPerDay` handles all formats via `timeframeToMinutes`; extremely fine timeframes (1S) would yield ~86400 candles/day — the 30% min ensures the slider stays usable |

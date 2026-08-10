# UX Design — Backtest Panel: Date-Range Guardrails

**Scope:** days-back slider mode + explicit date-range mode. Only date-range controls. Source of truth: `frontend/src/utils/candleLimit.ts` (`SAFE_AMOUNT_OF_CANDLES = 1500`, `maxSafeDays(tf) = 1500 / candlesPerDay(tf)`, `sliderBounds(tf) = [ceil(0.3·maxSafeDays), floor(maxSafeDays)]`). Timeframes: 1m, 5m, 15m, 30m, 1h, 4h, 1d.

## 1. Guardrail Rule Table

| # | Mode | Rule (exact bound/formula) | Violation message (exact copy) | BLOCK or WARN |
|---|------|---------------------------|--------------------------------|---------------|
| 1 | Days-back slider | Min = `ceil(0.3 * maxSafeDays(tf))`, max = `floor(maxSafeDays(tf))`; value clamped into `[min, max]` on change and on mount | (no message — silent clamp, slider cannot be left out of bounds) | WARN (clamp) |
| 2 | Days-back slider | Non-integer / out-of-range input value from storage is replaced with nearest bound | "Invalid backtest period reset to {bound} days." | WARN (clamp) |
| 3 | Explicit range | `start <= end` | "Start date must be on or before the end date." | BLOCK |
| 4 | Explicit range | `end <= today` (no future dates) | "End date cannot be in the future." | BLOCK |
| 5 | Explicit range | Range length `>= 1 day` (inclusive) | "The range must span at least 1 day." | BLOCK |
| 6 | Explicit range | `estimateBars(start, end, tf) <= 1500` | "This range would load more than 1500 candles. Shorten it or switch to a higher timeframe." | BLOCK |
| 7 | Explicit range | Date input beyond calendar bounds (before epoch / after today) | "Date out of range. Choose a date between {min} and {max}." | BLOCK |
| 8 | Both modes | Timeframe change re-clamps both modes to the new timeframe's bounds (rules 1–6 re-evaluated) | Reuse messages 2–6 as applicable | BLOCK/WARN per rule |

## 2. Clamp Semantics

- **Clamp-on-change:** any user edit (slider drag, date picker confirm, typing) is normalized the moment the value changes — value may never briefly render out of bounds; blocking rules (3–7) are re-evaluated and the run stays disabled with a visible message.
- **Clamp-on-mount:** on panel open, stored values (localStorage `pine-backtest-settings` incl. timeframe/symbol) are validated against the current timeframe's bounds; out-of-bounds or stale values are silently corrected to the nearest valid bound and persisted. If correction yields a rule-3–7 violation, the explicit-range message shows and the run is disabled — never auto-changed to a different valid range (user intent is preserved; correction is the minimum fix).

## 3. Timeframe-Change Interaction Matrix

| Timeframe change | Days-back mode | Explicit range mode |
|------------------|----------------|---------------------|
| Any change (e.g. 1m → 4h) | Recompute bounds from new `maxSafeDays`; clamp value into new `[min, max]` | Recompute `estimateBars`; keep dates (they are absolute, not scaled); re-apply rules 3–7 |
| Bounds shrink (lower tf → higher tf): value was valid, now out of range | Clamp to nearest bound; persist | Dates unchanged; bar estimate drops — typically resolves rule 6 |
| Bounds grow (higher tf → lower tf): value was at old max | Keep value (still valid), do not auto-extend | Dates unchanged; bar estimate rises — may newly violate rule 6 → BLOCK with message 6 |
| Symbol change with same tf | No date change; bar estimate may shift → re-run rules 3–7 only | No date change; re-run rules 3–7 only |

## 4. SampleFeesCard Interaction States (trigger = symbol change)

| State | Behavior |
|-------|----------|
| idle | Shows current symbol's fees; no probe pending |
| probe | On symbol change, debounce 500 ms before requesting; show subtle "Updating…" |
| loading | Request in flight; card remains visible with loading indicator; inputs stay interactive |
| success | Updated fees shown; timestamp of last update |
| error | Keep previous fees; show inline "Couldn't load fees for {symbol}. Retry" with a Retry button (re-probes current symbol, same debounce) |
| hidden-absent | Symbol has no fee record or symbol is empty — card hidden entirely; no error shown |

## 5. WHEN/THEN Test Scenarios (Test Engineer)

1. WHEN slider mode on 1m (bounds 1–1) THEN slider value is 1 and run is allowed.
2. WHEN slider value persisted as 999 on 5m (max 5) THEN on mount it clamps to 5.
3. WHEN user drags slider below min on 15m THEN value snaps to min (5) and run stays enabled.
4. WHEN explicit range has start > end THEN run is BLOCKED and message 3 shows.
5. WHEN explicit range end date is tomorrow THEN run is BLOCKED and message 4 shows.
6. WHEN explicit range start == end (same day) THEN run is allowed (length = 1 day).
7. WHEN explicit range start == end + 1 day → blocked by rule 5.
8. WHEN explicit range yields 1600 estimated bars on 1h THEN run is BLOCKED and message 6 shows.
9. WHEN timeframe changes 1h → 1d with days-back at 62 THEN value stays 62 (still ≤ 1500).
10. WHEN timeframe changes 1d → 1h with days-back at 62 THEN value clamps to 62 (new max) and persists.
11. WHEN timeframe changes 1h → 1d with explicit range 1/1–3/31 THEN dates kept; estimate drops below 1500; run enabled.
12. WHEN timeframe changes 1d → 1h with explicit range 1/1–3/31 THEN dates kept; estimate exceeds 1500; run BLOCKED with message 6.

## HANDOFF
**Verdict:** ✅ DONE — guardrail decision doc delivered, 5 required sections + handoff, under 120 lines.
**Evidence:** File written per required structure; rules derive from given spec + `candleLimit.ts` contract; per-timeframe bounds verified: 1m[1,1], 5m[2,5], 15m[5,15], 30m[10,31], 1h[19,62], 4h[75,250], 1d[450,1500].
**Files touched:** `openspec/changes/renovate-backtest-panel/design-ux.md` (new).
**Next owner:** frontend-engineer — implement clamp-on-change/mount + BLOCK gating per this table; Test Engineer scenarios 1–12 are the acceptance contract.
**Blockers / open questions:** none — exact violation copy approved here as source of truth for copy consistency.

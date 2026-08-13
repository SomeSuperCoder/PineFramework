# Recharts — lock in reduced-motion via explicit `isAnimationActive`
**Date:** 2026-08-13
**Source:** team/frontend/ux-designer (a11y audit, animations-v1)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Explicitly pass `isAnimationActive={false}` (or `"auto"`) on the Recharts `AreaChart`/`BarChart` in `frontend/src/components/StatisticsTab.tsx` (and any other chart using `ChartContainer`, e.g. `BacktestResults.tsx`).

## Rationale
The motion audit found the charts are compliant ONLY via Recharts 3.x's default: `isAnimationActive` defaults to `'auto'`, which natively disables animation for `prefers-reduced-motion: reduce` users. This is verified behavior today (recharts ^3.10.1, per official Recharts guide: "When isAnimationActive is set to 'auto' (the default), Recharts respects the prefers-reduced-motion media feature"). However the behavior is implicit — nothing in the codebase states the intent. If a future Recharts major changes the default, or someone sets `isAnimationActive={true}` to force an entrance, reduced-motion users would silently get a 1500ms JS-driven mount animation that the CSS global guard in `main.css` CANNOT disable (Recharts animates via requestAnimationFrame, not CSS). An explicit flag makes the reduced-motion contract durable.

## Evidence
- `frontend/src/components/StatisticsTab.tsx` — `<AreaChart>` / `<BarChart>` render without `isAnimationActive`; default `'auto'` is doing the reduced-motion work today.
- `frontend/src/components/ui/chart.tsx` — `ChartContainer` does not pass `isAnimationActive` and does not consume `useReducedMotion`.
- Recharts guide: https://recharts.github.io/en-US/guide/animations (accessibility section).

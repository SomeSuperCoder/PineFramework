# StatisticsTab charts: tooltips likely dead (wrong ChartTooltipContent usage)
**Date:** 2026-08-10
**Source:** Scout (Shadcn setup audit) + Frontend Lead advisory
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Fix `frontend/src/components/StatisticsTab.tsx` — both `EquityCurveChart` (line 69) and `GroupedPnlChart` (line 94) render `<ChartTooltipContent />` as a DIRECT chart child instead of `<ChartTooltip content={<ChartTooltipContent />} />`. `ChartTooltipContent` returns null without `active`/`payload` (chart.tsx:183), so tooltips are likely dead. The backtest popup swap uses the correct pattern — apply the same fix here.

## Rationale
Tooltips are the primary interactive value of a chart; dead tooltips mean the user gets no hover detail on equity/PnL. The correct wiring pattern is proven in the codebase after the popup swap.

## Evidence
- `frontend/src/components/StatisticsTab.tsx:69,94` — direct `<ChartTooltipContent />` child
- `frontend/src/components/ui/chart.tsx:183` — returns null without active/payload
- Correct pattern: `<ChartTooltip content={<ChartTooltipContent />} />`
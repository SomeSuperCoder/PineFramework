# Chart Toolbar — Shadcn Selects

## Problem Statement

The chart toolbar's two dropdowns — **symbol** and **timeframe** — in `DashboardToolbar.tsx:77,93` render as **browser-native `<select>`** elements. They look out of place next to the polished shadcn/radix UI: every other dropdown in the app (StatisticsTab group-by, TelegramConfigPanel, etc.) uses the design system's `ui/select.tsx` primitive, which is styled, keyboard-accessible, and already carries the enter/exit motion treatment.

## Proposed Change

Swap both native selects in `DashboardToolbar.tsx` for the existing shadcn `Select` component:

1. **Symbol select** → `<Select>` with `SelectTrigger` (aria-label "Symbol") + `SelectContent` mapping `pairOptions` (Option[] value+label) to `SelectItem`s.
2. **Timeframe select** → same pattern with `timeframeOptions`, aria-label "Timeframe".
3. **Behavior preserved byte-for-byte:** controlled `value` from props, `onValueChange` → setState + `localStorage.setItem('pine-symbol' | 'pine-timeframe')`, same option values/labels.
4. **Visuals:** compact trigger (`h-9`, text-xs) matching the toolbar strip; house pattern = the StatisticsTab usage (`<SelectTrigger className="h-9" aria-label=...>`).
5. Remove the now-unused `selectClass` constant.

## Non-goals

- No changes to the other native selects (TradeHistoryTab filter, BotControls pair/timeframe, CodeEditor) — Director scoped this to the chart toolbar
- No chart logic, no option sets, no state management changes
- No changes to the Select primitive itself (already correct + motion-treated)

## Affected Capabilities

- `frontend-application` — dashboard toolbar / chart controls

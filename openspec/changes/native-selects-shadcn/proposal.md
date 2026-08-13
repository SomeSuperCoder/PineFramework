# Proposal — Swap remaining native selects to shadcn Select

## Why
- Three components still render browser-native `<select>` elements (6 total), visually inconsistent with the shadcn/radix UI everywhere else.
- The pattern is proven: DashboardToolbar (commit c3c90e5) + e2e lock `frontend/e2e/chart-toolbar-selects.spec.ts`.

## What Changes
| File | Selects | Notes |
|------|---------|-------|
| `TradeHistoryTab.tsx` | Timeframe filter | local `TIMEFRAME_OPTIONS` (7), '' = all → sentinel `'all'` |
| `CodeEditor.tsx` | Script selector | optgroups My Scripts / Built-In Tests → `SelectGroup`+`SelectLabel` |
| `bot/BotControls.tsx` | DEX, Timezone, Pair, Timeframe | mini compact triggers; Timezone groups → `SelectGroup`+`SelectLabel`; Pair '' placeholder → `SelectValue placeholder` |

## Out of Scope
- `DashboardToolbar.tsx` (already shadcn), `ui/select.tsx` (primitive)
- BacktestPanel / App / TradeTabShared (already shadcn consumers)
- No localStorage changes (none of these 6 use it)
- No visual redesign — replicate current density/size per select

## Risks / Radix Constraints
- Radix has NO native optgroup → emulated via `SelectGroup`+`SelectLabel` (CodeEditor, Timezone)
- Radix `Select.Item` value CANNOT be `''` → sentinel values (TradeHistoryTab `'all'`; BotControls Pair uses placeholder)
- 3 unit tests WILL/LIKELY break → rewrite to the radix interaction pattern already in-file at `trade-dashboard.test.tsx:606-614`

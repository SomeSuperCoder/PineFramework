# Design — Chart Toolbar Shadcn Selects

## Decisions

### D1. Use the existing shadcn Select primitive — no primitive changes
`ui/select.tsx` exports `Select, SelectTrigger, SelectValue, SelectContent, SelectItem, ...` (radix-based) and already has the motion treatment (`data-open:animate-in` / `data-closed:animate-out` + motion tokens, line 72). No edits to the primitive — pure consumer-side swap in `DashboardToolbar.tsx`.

### D2. House pattern = the StatisticsTab usage
Reference precedent (`StatisticsTab.tsx`):
```tsx
<Select value={groupBy} onValueChange={(v) => setGroupBy(v as ...)}>
  <SelectTrigger className="h-9" aria-label="..." title="...">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="...">Label</SelectItem>
  </SelectContent>
</Select>
```
Toolbar variant: keep the toolbar's compact feel — `SelectTrigger` gets `className="h-9"` (toolbar strip is h-12) and `size="sm"` if it needs the tighter height; `text-xs` optional on trigger + items if it reads better in the 12px toolbar (Decision: match toolbar density — `size="sm"`, keep the primitive's default text unless visually oversized; the frontend-engineer verifies by reading the built toolbar density, not by trial-and-error).

### D3. Behavior preserved exactly
- Controlled: `value={symbol}` / `value={timeframe}` (radix shows the selected item's label via `SelectValue`).
- `onValueChange`: `setSymbol(v)` + `localStorage.setItem('pine-symbol', v)` (same for timeframe / pine-timeframe).
- Option sets unchanged: `pairOptions` / `timeframeOptions` are `Option[]` (`{ value, label }` from `@/utils/options`).
- Aria: `aria-label="Symbol"` / `aria-label="Timeframe"` on the triggers (radix adds combobox semantics + keyboard nav for free).
- `selectClass` constant becomes dead → remove it.

### D4. Scope boundary
Only `DashboardToolbar.tsx`'s two selects. TradeHistoryTab / BotControls / CodeEditor native selects are explicitly out of scope (Director scoped to the chart toolbar).

## Blast radius (verified)

- No unit tests reference DashboardToolbar or `getByLabelText('Symbol'/'Timeframe')` — no vitest breakage expected.
- No e2e uses `selectOption` on these controls — no existing spec breaks.
- New regression lock: small e2e proving the radix dropdowns open, list the expected options, and persist selection to localStorage.

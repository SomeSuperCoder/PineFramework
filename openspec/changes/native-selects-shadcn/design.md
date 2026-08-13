# Design — Native selects → shadcn Select

Pattern (from DashboardToolbar c3c90e5, StatisticsTab precedent):
```tsx
<Select value={...} onValueChange={...}>
  <SelectTrigger aria-label="..." className="..."><SelectValue /></SelectTrigger>
  <SelectContent>
    {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
  </SelectContent>
</Select>
```
Options come from ui/select.tsx: Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue.

## Per-select mapping

### S1 TradeHistoryTab.tsx L182-194 — Timeframe filter (compact h-9)
- value: `timeframe`; options: `''` ("All timeframes") + local `TIMEFRAME_OPTIONS` (1..1440, L54-62)
- Side effect: setTimeframe → filter useMemo → useTradeHistory refetch with timeframe= query param
- RADIX FIX: `value={timeframe || 'all'}`, `onValueChange={(v) => setTimeframe(v === 'all' ? '' : v)}`, SelectItem value="all" label="All timeframes"
- Trigger: `className="h-9 border border-input bg-background px-2 text-[11px] text-foreground box-border"` (keep filterInputClass look), `aria-label="Timeframe filter"` (preserve accessible name the tests use via title)

### S2 CodeEditor.tsx L264-283 — Script selector (header, flex-1)
- value: `currentScriptId || ''`; optgroups "My Scripts" / "Built-In Tests" from state arrays (scripts, builtInScripts)
- Side effect: handleDropdownChange guards id===currentScriptId, then loadScript → setCurrentScriptId + setSource
- RADIX: optgroups → `<SelectGroup><SelectLabel>My Scripts</SelectLabel>...<SelectItem>...</SelectGroup>`; empty branch guard `scripts.length > 0` stays
- Trigger: `className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-[13px] text-foreground outline-none"` + h matched to py-1.5 (~h-8) via className; `aria-label="Script"` (no existing accessible name)
- `value={currentScriptId ?? undefined}` (placeholder none — first script auto-loads)

### S3 BotControls.tsx L451 — DEX (mini compact)
- value: `dex`; 2 hardcoded options jupiter-swap / jupiter-ultra
- Side effect: setDex only → POST /api/bot/configure body
- Trigger: keep visible `<label>DEX:</label>`; add `aria-label="DEX"`; className preserves `ml-1 rounded border border-[var(--color-border)] bg-[var(--color-secondary)] px-1.5 py-1 text-[11px] text-[var(--color-foreground)]` on trigger + h-7 to match py-1 density (chevron shrinks content — keep px small)

### S4 BotControls.tsx L503 — Timezone (mini compact, grouped, filterable)
- value: `timezone`; `TIMEZONE_GROUPS` (local, continent optgroups) + client-side filter input (placeholder="Filter...", filters `z.toLowerCase().includes(filter)`)
- Side effect: setTimezone only
- RADIX: keep filter input + filtering logic; render filtered items inside SelectContent grouped: `<SelectGroup><SelectLabel>{group.group}</SelectLabel>{group.items.filter(...).map(...)}</SelectGroup>`; label via getTimezoneLabel
- Trigger: `aria-label="Timezone"`, same compact classes as S3

### S5 BotControls.tsx L896 — Manual Pair (mini compact, placeholder)
- value: `manualPair?.symbol ?? ''`; options: '' ("Select pair...") + TRADABLE_PAIRS map with getTokenInfo display
- Side effect: functional setManualPair preserving timeframe (default '60')
- RADIX: `value={manualPair?.symbol}` (undefined when unset → placeholder), `onValueChange={(v) => setManualPair(prev => ({ symbol: v, timeframe: prev?.timeframe ?? '60' }))}`, `<SelectValue placeholder="Select pair..." />` (drops the empty-value option — matches Radix idiom; no test depends on re-clearing)
- Trigger: `aria-label="Pair"`, compact classes as S3

### S6 BotControls.tsx L914 — Manual Timeframe (mini compact)
- value: `manualPair?.timeframe ?? '60'`; 7 hardcoded options (1m..1d)
- Side effect: functional setManualPair preserving symbol
- Trigger: `aria-label="Timeframe"`, compact classes as S3

## Test rewrites (test-engineer)
1. `trade-dashboard.test.tsx:431` — selectOptions(title) → click combobox by name + `findByRole('option', { name: '1h' }).click()` (copy in-file shadcn precedent L606-614)
2. `bot-stop-step.test.tsx:294-298` — `getAllByRole('combobox')[0]` + selectOptions → `getByRole('combobox', { name: /Pair/ })` click + `findByRole('option', { name: 'SOLUSDT' })`
3. `CodeEditor.test.tsx:83-84` — unselected options no longer render → assert trigger + open dropdown; verify each other test's assertion path
4. Optional e2e lock in trade-dashboard.spec.ts for the swapped filter — judge against fixture, skip if flaky-risk

# Visual Design — Renovated Backtest Start Panel

**Mode:** Operate — the visitor configures a backtest and runs it. Scanability and consistency outrank expression; the design language is inherited, not invented.

## Direction Contract

```
THESIS:   The backtest start panel is a settings surface, not a dashboard —
          one card per logical decision, read top-to-bottom, run action last.
OWN-WORLD: The TelegramConfigPanel card world: dark-only, hairline cards, uniform
          h-10 controls, lucide icons, StatusCallout feedback, CardSkeleton loading.
STORY:    A trader picks strategy + market, sets capital and date window, sees
          live Jupiter fees, and runs — every state accounted for, no surprises.
FIRST VIEWPORT: Header "Backtest Settings" + X; Strategy card; General card
          (Market → Capital → Date Range with guardrail); Commission card;
          SampleFees card; Run Backtest pinned in the header row.
FORM:     Extension of the established Telegram card recipe (new-work / extend).
FINISH:   reviewed against this contract; the incumbent recipe is the bar.
```

**Authority (substituted for the missing DESIGN.md):**
- `openspec/changes/archive/2026-08-09-redesign-telegram-settings/design.md` — the card recipe (shell, Card, SectionHeader, SettingRow, StatusCallout, Skeleton, h-10, aria, token purge).
- `openspec/changes/archive/2026-08-09-shadcn-ui-frontend-rework/design.md` — token bridge law (D2: `--pf-*` source → shadcn aliases in `main.css` `@theme inline`; D3: primary = white pill, yellow accent ≤1/viewport, blue ring/focus; weight cap ≤600; dark-only forever; focus ring 2px + offset).
- Live quality bar: `frontend/src/components/TelegramConfigPanel/**` (`index.tsx`, `SectionHeader.tsx`, `SettingRow.tsx`, `StatusCallout.tsx`, `CardSkeleton.tsx`, `ConnectionCard.tsx`).
- Theme: `frontend/src/main.css` `@theme inline` — the ONLY token namespace. No `--pf-*` vars remain in `index.css`; legacy `theme/tokens.ts` is a runtime object for canvas/chart code only and is **not** a source for Tailwind classes.

**Scope:** `BacktestPanel.tsx` + `StrategySelector.tsx` + `BacktestGeneralSettings.tsx` + `BacktestCommissionSettings.tsx`. No other panels.

---

## 1. Card Composition & Order

The panel is a `flex flex-col gap-4` stack of **four** cards, followed by nothing (Run Backtest lives in the header row — see §2):

| # | Card | Contents | Change |
|---|------|----------|--------|
| 1 | **Strategy** | Strategy selector (search + paste fallback) | Wrapped in Card; height/hex normalization |
| 2 | **General** | Market (pair + timeframe) → Initial Capital → Date Range (+ guardrail) | Market section **new**; heights normalized; guardrail → StatusCallout |
| 3 | **Commission** | Commission method Select + per-method description + remaining per-method config | Advanced collapsible **removed**; callouts → StatusCallout |
| 4 | **SampleFees** | Autofetched Jupiter fees (dexFeeBps, source badge, dexLabel, solPriceUsd) | **New**; hidden when feature absent |

**Why this order:** read as a decision sequence — *what* strategy, *which market + window*, *what costs*, *what the costs actually are*. The most frequent/safe decisions (strategy) come first; the dynamic fee truth comes last, directly above the Run action that consumes it.

**Card anatomy (all four, identical recipe):**

```
<Card className="rounded-md border border-border bg-card">
  <CardHeader className="p-5 pb-2">
    <CardTitle className="text-base font-semibold">…</CardTitle>
    <CardDescription className="text-[13px] text-muted-foreground">…</CardDescription>
  </CardHeader>
  <CardContent className="flex flex-col gap-4 p-5 pt-2">
    …sections…
  </CardContent>
</Card>
```

- Sections inside a card use `SectionHeader` (lucide icon `size-4` `text-muted-foreground` + `text-[13px] font-semibold tracking-tight` over `border-b border-border pb-2 mb-2`).
- Rows use `SettingRow` (label `text-sm font-medium`, desc `text-xs text-muted-foreground`, control right, `border-b border-border/50 py-2.5`). Last row in a section does **not** get a bottom hairline unless a section follows.
- **Uniform `h-10` on every input, button, select, and icon button. No height mixing — this is the #1 visual quality gate.**

---

## 2. Shell & Header (`BacktestPanel.tsx`)

**Shell** (preserve — already recipe-exact):
```
<div className="flex flex-1 flex-col overflow-auto rounded-md border border-border bg-card p-5 text-foreground">
```
Do **not** add `style`, do not change classes. Remove nothing.

**Header** — align to the Telegram recipe exactly:
- Container: `mb-4 flex items-center justify-between gap-2.5` (currently `gap-2`, missing `justify-between`).
- Title: `<h3 className="m-0 text-[16px] font-semibold tracking-tight">Backtest Settings</h3>` — add `tracking-tight` (currently `text-base`, same size, missing tracking).
- Close: replace the `← Back` outline text button with a **ghost icon button** `variant="ghost" size="icon" className="h-10" aria-label="Back to dashboard"` containing `<X className="size-4" />` (lucide `X`). Matches Telegram's close affordance; same aria-label as today so tests keep passing.
  - ⚠️ Visible copy changes from "← Back" to an X glyph — flag to Test Engineer (any text-based selector on "Back" must move to `aria-label`/role).

**Run Backtest** — stays in the header row (right of title, above the card stack — it is the page's single primary action; the recipe's "primary = white pill" applies):
- `className="h-10 whitespace-nowrap px-4"` (currently `h-11` — **violation**, fix).
- Default: `disabled={!selectedStrategy || barsExceedLimit}` + `title` help when no strategy (keep).
- Busy (running): `disabled` + `<Loader2 className="size-4 animate-spin" />` + `aria-busy={running}` — label stays "Run Backtest" (do not show literal `...`).
- Validation error (no strategy selected): `StatusCallout tone="error"` rendered directly below the header (`role="alert"`), not a bare `div role="alert"`. Message: "Select a strategy to backtest." Clears on strategy select.

---

## 3. Card 1 — Strategy

**Card title:** "Strategy" · **Description:** "Choose a Pine Script strategy to backtest."

**Layout:** single section (no SectionHeader needed — the CardHeader carries the heading). Content:

```
<section aria-label="Strategy">
  <SettingRow label="Strategy" description="Saved and built-in strategies.">
    <StrategySelector … />   <!-- w-full h-10 control -->
  </SettingRow>
  <div className="flex justify-end">
    <Button variant="ghost" size="sm" className="h-10 px-3 text-muted-foreground" …>Paste raw source</Button>
  </div>
</section>
```

**StrategySelector changes (in `StrategySelector.tsx`):**
- **Remove the `height` prop** and the inline `style={{ …heightStyle, minHeight, color }}` entirely. Control becomes `h-10 w-full`. The `height={36}` at the call site is deleted (this was the uniform-height violation).
- Trigger color: `text-foreground` when a strategy is selected, `text-muted-foreground` otherwise — via **classes**, never inline style.
- Trigger font: drop `text-[11px]`; use the shadcn default (`text-sm`). Drop `border-input` (shadcn default already inputs it).
- Selected-state Check icon: `text-[#22c55e]` → `text-foreground` (selection is already shown by the filled trigger + CommandItem selected styling; removes the only green from the selector). Icon stays `size-3.5`.
- **Badges (STG / IND / Built-In):**
  - IND + Built-In: keep `bg-primary/10 text-primary` (token-clean).
  - STG: `bg-[#22c55e]/10 text-[#22c55e]` → see §8 token table. Interim safe: `bg-primary/10 text-primary` (label text carries the distinction); preferred: `Badge variant="success"` once Design System Engineer adds the success token.
- Dropdown states (all inside `PopoverContent`/`Command`, no layout shift):
  - **Loading:** `CommandEmpty` text "Loading strategies…" (`py-3 text-center text-xs text-muted-foreground`).
  - **Error:** error message `text-xs text-destructive` + `Button variant="outline" size="sm" className="h-10"` labeled **Retry** (currently `h-6` — fix to h-10; a full-height button inside the popover is acceptable because it is an interactive control).
  - **Empty:** "No strategies found. Write one in the editor first." / search miss `No strategies matching "…"` (same copy, `text-xs`).
- Raw-paste fallback: keep the textarea (font-mono, `text-[11px]`, `border-input bg-background`, `rounded-md`), normalize the "← Select from list" button to `className="h-10 px-3 text-[10px]"`… → actually **h-10, `text-xs`**; the `←` arrow is a unicode glyph — replace with lucide `ArrowLeft className="size-3.5"` inline or drop the arrow (button copy "Select from list"). Prefer lucide `ArrowLeft` inline (icons are drawn, not glyphs — craft floor).

**States:**
- Default: trigger placeholder "Select a strategy…" muted; popover opens with search focused.
- Disabled: none (selector always enabled); the **Run** button is the disabled gate.
- Busy: none in the selector itself (fetch is per-open).

---

## 4. Card 2 — General (Market + Capital + Date Range)

**Card title:** "General" · **Description:** "Market, starting capital, and date window for the backtest."

Sections in order: **Market** → **Capital** → **Date Range**. Vertical rhythm: `flex flex-col gap-4`; each section = `SectionHeader` + rows.

### 4.1 Market section (NEW — panel-owned pair + timeframe)

```
<section aria-label="Market">
  <SectionHeader icon={CandlestickChart} title="Market" />
  <SettingRow label="Trading Pair" description="Solana spot pair to backtest.">
    <Select value={pair} onValueChange={onPairChange}>
      <SelectTrigger className="h-10 w-44" aria-label="Trading pair"><SelectValue /></SelectTrigger>
      <SelectContent>…SYMBOLS…</SelectContent>
    </Select>
  </SettingRow>
  <SettingRow label="Timeframe" description="Candle interval for bar data.">
    <Select value={timeframe} onValueChange={onTimeframeChange}>
      <SelectTrigger className="h-10 w-44" aria-label="Timeframe"><SelectValue /></SelectTrigger>
      <SelectContent>…INTERVALS…</SelectContent>
    </Select>
  </SettingRow>
</section>
```

- **Options source (SSOT):** the curated sets from `App.tsx` — `SYMBOLS` (spread of `TRADABLE_PAIRS`: `BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT, DOGEUSDT, ADAUSDT`) and `INTERVALS` (`1m, 5m, 15m, 30m, 1h, 4h, 1D, 1W` with values `1,5,15,30,60,240,D,W`). Import from the shared constants; do not duplicate literal lists in the panel. 7 pairs / 8 intervals — no ScrollArea cap needed, but `SelectContent` already scrolls if the viewport shrinks.
- SelectTrigger `w-44` (176px) on both — enough for "BTCUSDT"/"SOLUSDT" and every interval label without truncation; `shrink-0` so rows never squeeze it.
- **Aria:** `aria-label` on each `SelectTrigger` (the SettingRow label is a div, so the control self-labels); shadcn Select supplies `role="combobox"`/`listbox` semantics.
- **Behavior:** pair/timeframe are **panel-owned state** (per useBacktestPanelState) passed up at run time (`submitBacktest(symbol, timeframe, …)`); the App-header dropdowns are untouched. Changing timeframe here re-derives the Date Range slider bounds + guardrail (§4.3) immediately.
- **States:** default (value shown), open (listbox), no loading/error/empty (curated static lists). Focus ring = shadcn default.

### 4.2 Capital section

```
<section aria-label="Capital">
  <SectionHeader icon={Wallet} title="Capital" />
  <SettingRow label="Initial Capital" description="Starting equity for the backtest.">
    <NumberField … className="h-10" />   <!-- control: 160px, right-aligned -->
  </SettingRow>
</section>
```

- **NumberField height fix:** input `h-10 flex-1` (currently `h-11` — violation); stepper cluster becomes a single `h-10 w-9` ghost icon button containing the two chevrons stacked (ChevronUp/ChevronDown `size-4`), replacing the two `h-7 w-9` buttons (violation). The whole control stays one `InputGroup`/flex row at exactly `h-10`.
- Aria (keep + extend): input `aria-label="Initial capital"`; stepper buttons `aria-label="Increase"` / `"Decrease"`.
- Width: wrap the control in `w-40 shrink-0` so the row reads label-left / value-right.

### 4.3 Date Range section (+ guardrail)

```
<section aria-label="Date range">
  <SectionHeader icon={CalendarRange} title="Date Range" />
  <Tabs value={dateRangeMode} onValueChange={…} className="w-full">
    <TabsList className="w-full">
      <TabsTrigger value="days_back" className="flex-1">Days Back</TabsTrigger>
      <TabsTrigger value="traditional" className="flex-1">Begin / End</TabsTrigger>
    </TabsList>
  </Tabs>

  {mode === 'days_back' ? (
    minDays === maxDays ? (
      <div className="flex items-center gap-2 py-2.5">
        <span className="text-sm font-medium text-foreground">{maxDays}</span>
        <span className="text-xs text-muted-foreground">day(s) (only option — slider locked)</span>
      </div>
    ) : (
      <div className="flex items-center gap-3 py-2.5">
        <input type="range" … className="flex-1 accent-primary" aria-label="Days back" />
        <span className="min-w-[60px] text-right text-[13px] tabular-nums text-foreground">{daysBack}</span>
        <span className="text-xs text-muted-foreground whitespace-nowrap">days back from today</span>
      </div>
    )
  ) : (
    <div className="grid grid-cols-2 gap-2 pt-2.5">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="backtest-start-date" className="text-[13px] font-medium">Start Date</Label>
        <Input id="backtest-start-date" type="date" className="h-10" />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Label htmlFor="backtest-end-date" className="text-[13px] font-medium">End Date</Label>
        <Input id="backtest-end-date" type="date" className="h-10" />
      </div>
    </div>
  )}
</section>

{/* Guardrail — full-width, below the section, inside the card */}
{estimatedDays > 0 && (
  exceedsLimit ? (
    <StatusCallout tone="error">~{estimatedBars.toLocaleString()} bars exceeds limit of {SAFE_AMOUNT_OF_CANDLES}. Max for {TIMEFRAME_LABELS[timeframe]} is ~{maxDays} day(s).</StatusCallout>
  ) : (
    <StatusCallout tone="success">~{estimatedBars.toLocaleString()} bars (max {SAFE_AMOUNT_OF_CANDLES})</StatusCallout>
  )
)}
```

**Decisions:**
- **Mode toggle = `Tabs`** (segmented, roving tabindex — matches the rework's §15.5 pattern and the incumbent).
- **Slider:** native `input type="range"` — `accent-primary` class replaces the inline `style={{ accentColor: 'var(--color-primary)' }}` (violation → §8). Range input is the only control exempt from h-10 (native slider height ~20px); the **row** carries the h-10 rhythm via `py-2.5`.
- **Explicit range:** two `type="date"` inputs, `grid-cols-2`, each with `Label htmlFor` + `h-10` (currently `h-11` — violation).
- **Guardrail placement:** directly **below the Date Range section**, full-card-width, `mt-1`; NOT inside a SettingRow (it is feedback, not a setting). Uses the shared `StatusCallout` — success when within the candle budget, destructive when over. Over-limit also disables Run (existing `barsExceedLimit` wiring). Both tones announce (`role="status"` success / `role="alert"` error). Hidden when no range is set (`estimatedDays === 0`) — keep.
- Guardrail copy already names the recovery ("Max for 1h is ~N days") — keep, that is the correct error-recovery language (craft floor: errors name the problem **and** the recovery).
- **States:** days-back default; days-back **locked** (minDays === maxDays, e.g. weekly); explicit-range default; range with only one date (guardrail hidden until both); guardrail success; guardrail over-limit (destructive + Run disabled); focus rings on both date inputs.

---

## 5. Card 3 — Commission

**Card title:** "Commission" · **Description:** "Fee model applied to the backtest."

```
<section aria-label="Commission method">
  <SettingRow label="Commission Method" description={methodDescription}>
    <Select value={commissionMethod} onValueChange={…}>
      <SelectTrigger className="h-10 w-52" aria-label="Commission method"><SelectValue /></SelectTrigger>
      <SelectContent>…COMMISSION_METHODS…</SelectContent>
    </Select>
  </SettingRow>
  {jupiter_manual → <StatusCallout tone="success">Realistic fee model — DEX swap fee + 0% Jupiter commission + ~$0.0015 network fee</StatusCallout>}
  {jupiter_ultra → tier auto-detect callout (success) / default-tier info callout + custom-rate Switch row}
</section>
```

**Changes:**
- Method Select: `h-10` (shadcn default is h-9 — force h-10), `w-52`, `aria-label="Commission method"`; move the per-method description from the `text-[11px]` paragraph into the **SettingRow description slot** (`text-xs text-muted-foreground`) — same copy.
- **REMOVED (per scope):** the "Advanced settings" collapsible (`AdvancedToggle`) and the manual `DEX Swap Fee (bps)` / `SOL Price (USD)` inputs (`FeeField`, `NumberField`) from both Jupiter configs. The backend autofetches `dexFeeBps` at run time (`backtest.ts:118-130` overwrites `commissionMethodSettings.dexFeeBps`), so those inputs were cosmetic.
- Success/info callouts: replace raw-hex `border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]` with shared `StatusCallout`:
  - "Realistic fee model — …" → `tone="success"` (drop the leading `✓` unicode glyph — icons are drawn, not glyphs).
  - Jupiter Ultra "Auto-detected: Tier (N bps) from symbol X" → `tone="success"`.
  - "Default fee tier: 10 bps. Set a symbol to enable auto-detection." → `tone="info"`.
- Jupiter Ultra custom-rate `Switch` row: keep behavior; restyle to `Label` + `Switch` with `aria-label="Override with custom rate"` (recipe's labeled-Switch pattern from RecipientsCard), row `py-2.5`.
- The Jupiter docs link line: keep, `text-xs text-muted-foreground`, anchor `text-primary` (it is an inline link, not a button — no h-10).
- **States:** default; method change (Select resets sub-config per existing logic); callout success/info; no loading/error (static options).

---

## 6. Card 4 — SampleFees (NEW)

**Card title:** "Sample Fees" · **Description:** "Live Jupiter fees fetched for this pair — what the backtest will charge."

**Feature gate (render logic, in the card's parent):**
- Render the card **only** when: (a) `commissionMethod` is a Jupiter method, AND (b) the capability probe for `GET /api/backtest/dex-fee?symbol=…` returned success (404 → feature absent). **Never** render-on-fetch-success — the probe decides presence; the fetch decides content.
- When gated off → render `null` (card disappears entirely; the gap-4 stack closes up — no empty placeholder).

**States:**

| State | Render | Details |
|-------|--------|---------|
| **Loading** (probe ok, fetch in flight) | `<CardSkeleton />` | Recipe component — `Card` + 4 skeleton bars (`h-4 w-1/3`, `h-10 w-full`, `h-4 w-1/4`, `h-10 w-full`). No layout shift: the skeleton occupies the same slot as the loaded card. |
| **Error** (fetch failed) | Error block | `StatusCallout tone="error"` "Could not fetch live fees." + `Button variant="outline" className="h-10"` **Retry** (refetch). `role="alert"`. Mirrors Telegram panel's error state. |
| **Empty** (fetch ok, no fee data for pair) | Info block | `StatusCallout tone="info"` "No fee data available for {symbol}." — no retry (reprobe on pair change). |
| **Success** | Fee grid (below) | See layout. |
| **Absent** (probe 404 / non-Jupiter method) | `null` | Card hidden. |

**Success layout:**

```
<CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 p-5 pt-2">
  <div>
    <div className="text-xs text-muted-foreground">DEX Fee</div>
    <div className="text-sm font-medium tabular-nums text-foreground">{dexFeeBps} bps</div>
  </div>
  <div>
    <div className="text-xs text-muted-foreground">Source</div>
    <div><Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold">{sourceLabel}</Badge></div>
  </div>
  <div>
    <div className="text-xs text-muted-foreground">Pool / Route</div>
    <div className="text-sm font-medium text-foreground">{dexLabel ?? '—'}</div>
  </div>
  <div>
    <div className="text-xs text-muted-foreground">SOL Price</div>
    <div className="text-sm font-medium tabular-nums text-foreground">${solPriceUsd}</div>
  </div>
</CardContent>
```

- **Read-only data, not settings** → definition-list grid, NOT SettingRow hairline rows (rows imply editable settings). `grid-cols-2`, tight gaps; 4 facts fit one compact row.
- **Source badge:** value mapping `api → "Live API"`, `cache → "Cache"`, `in-memory-cache → "Memory Cache"` — `Badge variant="secondary"` (neutral; the badge's job is provenance, not status — do not invent a colored variant). Optionally `title={rawSource}` tooltip with the raw value.
- **Numbers:** `tabular-nums` on all numeric values (dexFeeBps, SOL price) — craft floor / rework's tabular-nums law.
- **dexLabel:** the pool/route name from the fetcher; `'—'` (em dash) when null — an empty cell is a broken cell.
- **Aria:** the card is static content; no live region needed. Add `aria-label="Sample fees"` on the CardContent grid only if a role is required — otherwise plain content. Errors use `role="alert"` via StatusCallout.
- **Motion:** none — appearing/disappearing is gated by probe + fetch; the CardSkeleton → content swap is instant (no re-animation; reduced-motion global already in `index.css`).
- **Copy discipline:** numbers are facts from the fetcher; no invented values, no placeholders (new-work: claims stay uninventable).

---

## 7. Global State Inventory

| Element | Default | Loading | Error | Empty | Disabled | Busy |
|---|---|---|---|---|---|---|
| Shell | recipe classes | — | — | — | — | — |
| Close X | ghost icon | — | — | — | — | — |
| Run Backtest | white pill h-10 | — | — | — | no strategy / bars over limit | disabled + Loader2 + aria-busy |
| Strategy trigger | placeholder muted | CommandEmpty "Loading…" | red msg + h-10 Retry | CommandEmpty | — | — |
| Pair / Timeframe selects | value shown | — | — | — | — | — |
| Initial Capital | h-10 field | — | — | — | — | — |
| Date mode Tabs | segmented | — | — | — | — | — |
| Slider | accent-primary | — | — | — | locked (minDays=maxDays) | — |
| Date inputs | h-10, calendar | — | — | — | — | — |
| Guardrail | — | — | destructive + Run off | hidden until range | — | — |
| Commission select | value + desc | — | — | — | — | — |
| SampleFees card | fee grid | CardSkeleton | destructive + Retry | info callout | — | — |
| Validation error | — | — | StatusCallout error | — | — | — |

**Aria checklist (every control):** `aria-label` on all icon-only controls (X, stepper up/down, eye-free); `Label htmlFor` on date inputs + strategy search input; `aria-label` on all three SelectTriggers; `role="status"` on success/info callouts, `role="alert"` on errors; `aria-busy` + `aria-disabled` on Run when busy; `aria-expanded`/`aria-controls` on the strategy combobox (keep); focus-visible rings = shadcn default (2px ring via rework's D-law).

---

## 8. Token Substitution Table

Current-panel violations → replacement. **Theme namespace = `main.css` `@theme inline` only.** No new raw hex in the panel; any *new* token (e.g. a semantic success color) is a Design System Engineer decision, not a component decision.

| # | File:line | Raw value / inline style | Replace with | Notes |
|---|-----------|--------------------------|--------------|-------|
| 1 | `StrategySelector.tsx:163` | `text-[#22c55e]` (Check icon) | `text-foreground` | Selection already signaled by filled trigger + CommandItem selected state |
| 2 | `StrategySelector.tsx:270` | `bg-[#22c55e]/10 text-[#22c55e]` (STG badge) | **Preferred:** `Badge variant="success"` once DSE adds a success token; **Interim:** `bg-primary/10 text-primary` (label carries STG/IND distinction) | ⚠️ Flag to Design System Engineer: no `--color-success` exists in the theme; candidate = legacy `semantic.success #00b473` or chart-2 `oklch(0.696 0.17 162.48)` |
| 3 | `StrategySelector.tsx:200-204` | inline `style={{…heightStyle, minHeight, color: 'var(--color-foreground)' : 'var(--color-muted-foreground)'}}` | Remove inline style; `h-10 w-full` + `text-foreground` / `text-muted-foreground` classes; delete `height` prop | Uniform-height + no-inline-style laws |
| 4 | `BacktestGeneralSettings.tsx:210` | inline `style={{ accentColor: 'var(--color-primary)' }}` | `accent-primary` class on the range input | Tailwind v4 accent-color utility |
| 5 | `BacktestGeneralSettings.tsx:254` | `border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]` (guardrail success) | `<StatusCallout tone="success">` | Recipe component owns the green |
| 6 | `BacktestCommissionSettings.tsx:182` | `border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]` (JupiterBasic success) | `<StatusCallout tone="success">` (drop `✓`) | — |
| 7 | `BacktestCommissionSettings.tsx:258` | `border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]` (Ultra tier callout) | `<StatusCallout tone="success">` | — |
| 8 | `BacktestGeneralSettings.tsx:83,229,241` | `h-11` inputs (NumberField, date inputs) | `h-10` | Uniform height |
| 9 | `BacktestGeneralSettings.tsx:89,96` | stepper buttons `h-7 w-9` | single `h-10 w-9` stepper cluster | Uniform height |
| 10 | `BacktestPanel.tsx:160` | `height={36}` prop | remove; control `h-10` | Uniform height |
| 11 | `BacktestPanel.tsx:167` | Run button `h-11` | `h-10` | Uniform height |
| 12 | `BacktestCommissionSettings.tsx:154,245,297` | `AdvancedToggle` `h-auto` + FeeField | **Removed** (advanced collapsible out of scope) | — |
| 13 | `BacktestCommissionSettings.tsx:98,325` | `text-[11px]` helper paragraphs | `text-xs text-muted-foreground` | Recipe desc scale |
| 14 | `StrategySelector.tsx:145,246` | tiny `h-6 px-2 text-[10px]` buttons | `h-10`, `text-xs` (Retry / Select-from-list) | Uniform height |

**Inline-style law (rework D2 conformance):** zero `style={{}}` on panel elements; zero raw hex literals in panel TSX. The only hex left in the whole feature area is inside the shared `StatusCallout` success tone — that is the Telegram recipe's sanctioned, tested single source and is out of panel scope (flag only, do not change).

---

## 9. Checklist — TelegramConfigPanel Recipe

| # | Recipe item | Status in this spec |
|---|-------------|---------------------|
| 1 | Shell `flex flex-1 flex-col overflow-auto rounded-md border border-border bg-card p-5 text-foreground`; header `text-[16px] font-semibold tracking-tight` | ✅ Preserved; header gains `tracking-tight` + `justify-between` + X ghost close |
| 2 | Card per logical feature: `CardHeader` title `text-base font-semibold` + `CardDescription text-[13px] text-muted-foreground`; `gap-4` stack | ✅ 4 cards (Strategy / General / Commission / SampleFees) with identical anatomy |
| 3 | SectionHeader: lucide `size-4` + `text-[13px] font-semibold tracking-tight` over `border-b` | ✅ General card gets 3 (Market/Capital/Date Range); Commission/Strategy rely on CardHeader |
| 4 | SettingRow: label `text-sm font-medium` + desc `text-xs text-muted-foreground`, control right, `border-b border-border/50 py-2.5` | ✅ Strategy, pair, timeframe, capital, commission rows |
| 5 | Uniform `h-10` controls — NO height mixing | ✅ §3–§5 + §8 rows 8–11; only native slider exempt |
| 6 | StatusCallout success `border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]`, error `border-destructive bg-destructive/10 text-destructive`, `role="status"`/`role="alert"` | ✅ Guardrail, commission callouts, validation error, SampleFees error all via StatusCallout |
| 7 | Loading CardSkeleton (no layout shift); busy disabled + Loader2 animate-spin + aria-busy | ✅ SampleFees loading → CardSkeleton; Run busy → Loader2 + aria-busy; no `...` text |
| 8 | Full aria labeling: aria-label, Label htmlFor, focus-visible rings | ✅ §7 inventory |
| 9 | NO raw hex / NO inline `style={{ tokens.colors }}` — Tailwind theme tokens only | ✅ §8 table; all 14 violations addressed |

**Open flags for other lanes (report, don't fix):**
- ⚠️ **Design System Engineer:** no success color token in `main.css` theme; candidate `#00b473` (legacy semantic.success) or chart-2 green → would unify StatusCallout + STG badge + guardrail on one token.
- ⚠️ **Test Engineer:** visible copy changes (Back → X icon, `✓` removed from commission callout); `height` prop removed from StrategySelector (any test asserting control height); existing `backtest-flow.test.tsx` coverage of BacktestPanel needs re-baselining; SampleFees gating logic (probe → render) wants a unit test.
- ⚠️ **Frontend Engineer:** `useBacktestPanelState` hook + capability probe + `submitBacktest(symbol, timeframe, …)` signature per proposal.md — this spec assumes that contract.

---

## HANDOFF

**Verdict:** 🟢 DONE — visual design spec delivered, spec document only, no code changed.

**Evidence:**
- Spec written: `openspec/changes/renovate-backtest-panel/design-visual.md` (this document).
- Grounded in: TelegramConfigPanel recipe files read verbatim (`index.tsx`, `SectionHeader.tsx`, `SettingRow.tsx`, `StatusCallout.tsx`, `CardSkeleton.tsx`, `ConnectionCard.tsx`); both archived design docs read; current panel components read (`BacktestPanel.tsx`, `StrategySelector.tsx`, `BacktestGeneralSettings.tsx`, `BacktestCommissionSettings.tsx`); theme verified (`main.css` `@theme inline` — no success token exists); curated option sets verified (`INTERVALS` 8 entries, `TRADABLE_PAIRS` 7 pairs).
- Protocol: `impeccable` loaded; context probe run (no PRODUCT.md — established world extension, `init` offered as follow-up); routed `new-work` → **extend existing surface** (no concept tournament — pinned recipe); `craft-floor.md` loaded before specifying UI.

**Files touched:** `openspec/changes/renovate-backtest-panel/design-visual.md` (new spec doc only).

**Next owner:** `frontend-engineer` — implement the spec (4-card composition, h-10 uniformity, pair/timeframe selects, date-range guardrail via StatusCallout, SampleFeesCard states, §8 token substitutions) per the `useBacktestPanelState` hook contract in proposal.md.

**Blockers / open questions:** none blocking the visual spec. Success-token decision (flag → Design System Engineer) and copy/test re-baseline (flag → Test Engineer) are handoff-time flags, not blockers.

**Self-reflection:** No exploration outside spawn data (all files read were named in the brief or required for the §8 token table); 2 skills loaded (impeccable — required; craft-floor/new-work — required by protocol); no tests re-run; token budget lean (targeted reads + 2 codegraph calls). 💡 `$impeccable init` offered as follow-up per context probe (no PRODUCT.md on disk) — Tech Lead's call.

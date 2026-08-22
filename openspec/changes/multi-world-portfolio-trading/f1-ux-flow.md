# F1 — UX Flow Design: Reworked Multi-World Backtester Wizard

**Change:** `multi-world-portfolio-trading`  ·  **Task:** F1 (UX flow design, no implementation)  ·  **Designer lane:** `team/frontend/ux-designer`
**Sources read:** `openspec/changes/multi-world-portfolio-trading/{proposal.md, design.md (D7)}`, and current frontend (`BotControls.tsx` SetupWizard, `AutoSelectGrid.tsx`, `useAutoSelectProgress.ts`, `StrategySelector.tsx`, `LiveDashboard.tsx:328-333` log auto-scroll pattern, `backend/src/routes/scripts.ts`).

---

## 0. Design Intent

The reworked wizard must "feel professional": a linear, legible pipeline where the user (1) chooses **what** to trade (multiple strategies), (2) watches a **bounded-concurrency** backtest over all candidate worlds, (3) reviews a **PnL-sorted ranking** and picks the top-N, (4) sees capital **split by PnL weight**, and (5) starts. A hard gate — **zero positive-PnL worlds blocks progression** — keeps the bot from ever launching a no-expectancy portfolio.

Key UX heuristics honored: **visibility of system status** (concurrency + auto-scroll), **user control & freedom** (back/CTA), **error prevention** (block before review), **recognition over recall** (PnL-sorted, labels carry symbol·timeframe·strategy).

---

## 1. Wizard Steps

Unified step union (replaces current `wallet|config|backtest-choice|backtest|review`):

```
wallet → config → strategies → backtest → ranking → allocation → review
```

`backtest-choice` is **merged into `backtest`** (timeframe pick + mode toggle shown pre-run inside the backtest step). `strategies`, `ranking`, `allocation` are new.

### Step 0 — Wallet  *(unchanged)*
- **Purpose:** import/confirm wallet. **Inputs:** seed + password. **Actions:** import wallet. **Transition:** Next → `config` (disabled until `wallet.hasWallet`).
- **States:** loading import; error (invalid seed / decryption fail).

### Step 1 — Config  *(changed: strategy removed from here)*
- **Purpose:** set DEX, max-daily-loss, timezone. **Inputs:** dex select, manual-override loss, timezone. **Actions:** save config; `onConfigured()`.
- **Transition:** Next → `strategies`.
- **⚠ Change for engineer:** `BotConfigPanel` currently renders `StrategySelector` (single source). **Remove the single-strategy selector from `BotConfigPanel`** — strategy selection moves to the new `strategies` step. Config no longer sends `strategySource`; it sends `dex`, `risk`, `timezone` only.
- **States:** compatibility warnings; configure error/network error.

### Step 2 — Strategies (multi-select)  *(NEW — `StrategyMultiSelect`)*
- **Purpose:** pick 1…N live strategies (the "stg" axis of each world).
- **Inputs:** searchable multi-select of available strategies (from `/api/scripts` + `/api/scripts/built-in`, filtered `scriptType==='strategy'`, same fetch as `StrategySelector`).
- **Actions:**
  - Open popover → search → toggle checkboxes to add/remove strategies.
  - Each selected strategy renders as a removable **chip** (× button, `aria-label="Remove {name}"`).
  - `Next` enabled only when `selectedStrategies.length >= 1`.
- **Transition:** Next → `backtest` (carries `selectedStrategies`). Back → `config`.
- **Empty/loading/error states:**
  - *Loading:* "Loading strategies…" in popover.
  - *Empty:* "No strategies found. Write one in the editor first." + link/CTA to editor.
  - *Error:* "Could not load strategies. Is the backend running?" + **Retry** button.
  - *None selected:* Next disabled with helper "Select at least one strategy."
- **A11y:** `role="listbox"` + `aria-multiselectable="true"`; each row `role="option"` `aria-selected`; checkbox + name; keyboard: ↑/↓ move, Space toggles, Esc closes; chips in a labelled group.

### Step 3 — Backtest (backtest-all)  *(changed: multi-strategy candidates + concurrency + auto-scroll)*
- **Purpose:** run parallel (p-limit ≈4) backtests across all candidate worlds = every selected strategy × every selected timeframe × tradable symbols; show live progress.
- **Pre-run inputs (shown only while `!progress`):**
  - Timeframe multi-select chips (`5/15/60/240`…) — kept from current design.
  - Mode toggle: **Auto (backtest-all worlds)** vs **Manual (single world)**. Manual = pick one world (strategy already chosen in step 2 + manual symbol/timeframe); see §1.M.
- **Actions:** `POST /api/bot/backtest` with `{ timeframes, strategyIds }`; WS `bot:autoSelect` streams `progress` → `complete`.
- **Transition (success):** on `complete`, if `result.positiveWorlds.length > 0` → **auto-advance to `ranking`**; if `0` → **stay on `backtest` and render BLOCK panel (§2)** — do NOT auto-advance. (Replaces current `useEffect` at `BotControls.tsx:681-685` that blindly advanced on any result.)
- **Live display:**
  - `ProgressBar` (completed/total) + **concurrency badge** `"k / 4 active"` (bounded-concurrency visibility).
  - `AutoSelectGrid` (reworked) renders one row per candidate world `SYM · TF · STG`, with `phase`, `StatusIcon`, PnL% (color + sign), and a per-row **slot indicator** for active worlds.
  - **Auto-scroll:** grid container scrolls to the active world(s) (reuse `LiveDashboard.tsx:328-333` `scrollTop = scrollHeight` pattern — only the grid scrolls, never the page).
- **States:**
  - *Loading/running:* progress grid + spinner; `Next`/`Back` disabled while `progress` active.
  - *Partial failure:* individual rows show `failed` + truncated error; overall still completes.
  - *Complete w/ zero positive:* BLOCK (§2).
  - *Error:* WS/HTTP failure → "Backtest failed to start/stream" + **Retry**; user can also Back.

### Step 4 — World Ranking (PnL-sorted, top-N picker)  *(NEW — `WorldRankingPanel`)*
- **Purpose:** show every evaluated world sorted by PnL desc; let user pick the **top-N** (or manually override).
- **Inputs:** table of `WorldRankingEntry[]` (all evaluated, positive first, clearly grouped/divided at the PnL=0 line). Controls:
  - **"Trade top N worlds"** number input (min 1, max = `positiveWorlds.length`), default `N = positiveWorlds.length`.
  - Top-N rows (by PnL) auto-selected & highlighted. User may **toggle any row** to override (selection becomes explicit set).
  - Live count "X of Y positive-PnL worlds selected" + sum of allocated capital preview (feeds step 5).
- **Actions:** `onToggleWorld(key)`, `onTopNChange(n)`.
- **Transition:** Next → `allocation` (disabled unless ≥1 world selected). Back → `backtest` (re-run or keep result).
- **States:**
  - *Empty (shouldn't happen here — blocked earlier):* muted "No worlds evaluated."
  - *Non-positive only:* handled by §2 block before reaching this step; if user Back-toggles, panel shows the PnL=0 divider and a note "Only non-positive worlds available — go back and pick another strategy."

### Step 5 — Capital Allocation (PnL-weighted USDC split)  *(NEW — `CapitalAllocationPanel`)*
- **Purpose:** split user-defined USDC capital across selected worlds proportional to PnL weight.
- **Inputs:**
  - **Total capital (USDC)** number input — explicit (per D6: live balance stub is NOT used for allocation math).
  - Computed `AllocationEntry[]`: `weight = pnl_i / Σ pnl_selected`, `allocatedUsdc_i = total × weight` via largest-remainder rounding, dust to largest weight (D5).
- **Display:** per-world row `World | PnL weight % | Allocated USDC` + total row `Σ = totalCapital`. Inline validation that Σ allocated == totalCapital (within rounding dust).
- **Actions:** `onTotalCapitalChange`. Editing total or selection recomputes splits live.
- **Transition:** Next → `review`. Back → `ranking`.
- **States:**
  - *No selection:* panel disabled "Select worlds in the previous step first."
  - *Zero/invalid capital:* input error "Enter a capital amount greater than 0"; Next disabled.
  - *D6 note (visible, non-blocking):* small helper "Capital is allocated from the amount you enter; live wallet balance is not used for the math (balance source pending)."

### Step 6 — Review & Start  *(changed: multi-world summary)*
- **Purpose:** confirm full portfolio before launch.
- **Display:** wallet (truncated key), strategy count + names, DEX, max-daily-loss, timezone, **selected worlds list** (each `SYM · TF · STG` + PnL% + allocated USDC), total capital.
- **Actions:** `Start Bot` (disabled while `progress`/chaos error). `Back` → `allocation`. Reset Config / Reset Everything retained.
- **States:** startError, resetError, chaosError (Start blocked) — unchanged behavior.

### §1.M — Manual mode (single world)
Manual selection is retained but re-scoped to a single world: strategy is already chosen in step 2; manual mode lets the user pick one `symbol`+`timeframe` (reusing current manual inputs) forming a single world. It bypasses ranking/allocation auto-picking (N=1, 100% capital) but still flows through `ranking`→`allocation` for consistency (single row, pre-selected). No block state applies (single explicit user choice).

---

## 2. BLOCK STATE — zero positive-PnL

**Trigger:** backtest `complete` with `result.positiveWorlds.length === 0`.

**Placement:** rendered **inline in the `backtest` step** (replacing/above the "Auto-Select Complete" success card), and the wizard **does not leave the `backtest` step** (no auto-advance). The `Next` button on the backtest step is disabled while blocked.

**Exact copy (verbatim — implement as written):**

> ### ⚠ No profitable worlds found
> Every backtested combination finished with **non-positive PnL**. The bot won't trade a portfolio with no positive expectation.
>
> **← Back — pick another strategy**
>
> *Adjust your strategy selection or timeframes, then run the backtest again.*

- **Primary CTA** = button labeled exactly **"← Back — pick another strategy"** → `setStep('strategies')` (or `setStep('config')` if user prefers re-configuring timeframes). It is the first focusable element in the block.
- **Secondary hint** (muted, below CTA): *"Adjust your strategy selection or timeframes, then run the backtest again."*
- **Supporting context (do not omit):** still render the full evaluated grid in a **muted/disabled** style so the user sees *what* was tested and their PnL, reinforcing why the block occurred (visibility of system status).
- **Gate enforcement:** review step is unreachable while `blocked === true`; reset `blocked` when user re-runs backtest or changes strategy selection.

---

## 3. Component Inventory

### 3.1 `StrategyMultiSelect`  *(new)*
- **Props:** `strategies: MergedStrategy[]` (or `loading`/`error`/`onRetry` if it self-fetches), `selected: SelectedStrategy[]`, `onChange: (next: SelectedStrategy[]) => void`, `maxN?: number`.
- **Internal state:** `open`, `search`, plus reuse the popover+`Command` listbox pattern from `StrategySelector`.
- **Renders:** searchable listbox (multi, checkbox per row) + selected-strategy **chips** with remove.
- **Reuse:** extract a `useStrategies()` hook (or shared fetcher) so the `/api/scripts`+`/api/scripts/built-in` merge logic isn't duplicated. `StrategySelector` can later be refactored to wrap the same hook.

### 3.2 `WorldRankingPanel`  *(new)*
- **Props:** `ranking: WorldRankingEntry[]` (sorted desc by `pnlPercent`), `positiveCount: number`, `topN: number`, `onTopNChange: (n:number)=>void`, `selectedKeys: Set<string>`, `onToggleWorld: (key:string)=>void`.
- **State:** derives top-N highlight from `topN`; explicit selection set when user toggles.
- **Renders:** sortable table `Rank | World (SYM·TF·STG) | PnL% | PF | Sharpe | Selected`; a PnL=0 divider separating positive from non-positive; the "Trade top N" control + live selected-count.
- **Empty/error:** muted empty + non-positive note (see §1 step 4).

### 3.3 `CapitalAllocationPanel`  *(new)*
- **Props:** `allocation: AllocationEntry[]`, `totalCapital: number`, `onTotalCapitalChange: (n:number)=>void`, `balanceWarning?: boolean` (D6).
- **State:** none beyond controlled inputs; computation done in reducer/`useMemo`.
- **Renders:** total-capital input + per-world rows (`World | weight% | allocatedUSDC`) + total row; D6 helper note.
- **Empty/error:** disabled state; invalid-capital message.

### 3.4 `SetupWizard` (BotControls.tsx) — changes
- Step union gains `strategies | ranking | allocation`; `StepDot` list updated to 7 steps (clickable back-nav for completed steps, as today).
- Replace single `strategySource` config value with `selectedStrategies: SelectedStrategy[]`.
- Backtest step: replace blind auto-advance `useEffect` (lines 681-685) with result handling that routes to `ranking` **or** renders the §2 block; wire extended `progress`/`result` into `AutoSelectGrid` (concurrency + activeWorlds + auto-scroll).
- Review step: render **worlds list** (loop) instead of single `pairs[0]`/`best.label`; pull from `allocation`/`ranking`.
- Carry `selectedStrategies` into the `/api/bot/configure` payload as `worlds` (strategyId/source per world) for the backend v2 contract (see `design.md` D1/D4).

### 3.5 `AutoSelectGrid` — rework **without breaking** BotMetrics/BotControls
- **Backward-compatible signature:** keep `statuses`, `ranking?`, `candleProgress?`, `currentPair?` (deprecated alias). **Add optional** `concurrency?: number`, `activeWorlds?: string[]`.
- **Extraction (mitigates R1 — shared surface):** pull out subcomponents so existing callers (`BotMetrics.tsx:211`, `BotControls.tsx:1029/1050`) keep working unchanged:
  - `StatusIcon` (already separate — keep).
  - `CandidateRow` — one world's row (status + rank + optional concurrency slot).
  - `ConcurrencyBadge` — `k / N active` header chip.
  - `ScrollableGrid` — the `max-h-[200px] overflow-auto` container **with its own `ref`** + `useEffect` auto-scroll on `activeWorlds` change (reuse `LiveDashboard:328-333` pattern: only this container scrolls).
- `AutoSelectGrid` becomes a thin composer: old callers pass only legacy props → old behavior (no concurrency/auto-scroll); the wizard passes the new optional props → enriched grid. **No prop changes for BotMetrics/BotControls.**
- **Tokens:** restyle with `--color-*` tokens for consistency (most already use them — verify `bg-[var(--color-card)]`, `text-[var(--color-foreground)]`, etc.; replace any hardcoded hex except the intentional green `#22c55e`/red destructive which map to token equivalents).

---

## 4. Recommended State Shape (feeds Frontend Engineer reducer)

```ts
// ---- Domain types ----
type WizardStep =
  | 'wallet' | 'config' | 'strategies' | 'backtest' | 'ranking' | 'allocation' | 'review';

interface SelectedStrategy { id: string; name: string; source: string; isBuiltIn: boolean; }

// A world = strategy + timeframe + symbol (backend key `${symbol}:${timeframe}:${strategyId}`)
interface WorldRef { worldKey: string; strategyId: string; symbol: string; timeframe: string; }

interface CandidateStatus {
  worldKey: string;
  label: string;                 // "SYM · TF · STG"
  strategyId: string; symbol: string; timeframe: string;
  phase: 'fetching' | 'backtesting' | 'done';
  status: 'pending' | 'active' | 'done' | 'failed';
  slot?: number;                 // concurrency slot 0..concurrency-1 when active
  error?: string;
  pnlPercent?: number;           // totalPnlPercent (net quote units → %)
  profitFactor?: number;
  sharpeRatio?: number;
}

interface WorldRankingEntry extends WorldRef {
  label: string;
  pnlPercent: number;
  profitFactor?: number;
  sharpeRatio?: number;
  selected: boolean;
}

interface AllocationEntry extends WorldRef {
  label: string;
  pnlPercent: number;
  weight: number;                // 0..1
  allocatedUsdc: number;         // after largest-remainder rounding (D5)
}

// ---- WS payload extensions (useAutoSelectProgress.ts) ----
interface AutoSelectProgressV2 {
  current: number;              // completed candidates
  total: number;                // total candidates
  concurrency: number;          // p-limit size (~4)
  activeWorlds: string[];       // worldKeys currently 'active' (<= concurrency)
  statuses: Record<string, { phase: string; status: CandidateStatus['status']; error?: string; slot?: number }>;
  candleProgress?: { worldKey: string; fetched: number; total: number };  // per active fetch
  ranking?: Array<{ worldKey: string; label: string; metrics: Record<string, number> }>; // partial, grows as done
}

interface AutoSelectResultV2 {
  blocked: boolean;             // true => zero positive-PnL (D1)
  worlds: Array<WorldRef & { label: string; metrics: Record<string, number> }>; // full evaluated set
  positiveWorlds: Array<WorldRef & { label: string; metrics: Record<string, number> }>; // pnl > 0 only
  ranking: Array<WorldRef & { label: string; metrics: Record<string, number> }>; // sorted desc by pnl
  evaluatedCount: number;
  failedCount: number;
  positiveCount: number;
}
// NOTE: keep `best` shim if any legacy review code reads it; new code uses `positiveWorlds[0]`.

// ---- Reducer state ----
interface SetupWizardState {
  step: WizardStep;
  wallet: WalletInfo;
  configValues: ConfigValues | null;          // dex, risk, timezone (NO strategySource)

  // strategies
  selectedStrategies: SelectedStrategy[];

  // backtest
  selectedTimeframes: string[];               // ['5','15','60','240']
  backtestMode: 'auto' | 'manual';
  manualWorld?: WorldRef | null;
  progress: AutoSelectProgressV2 | null;
  result: AutoSelectResultV2 | null;
  blocked: boolean;                           // §2 gate

  // ranking
  ranking: WorldRankingEntry[];               // derived from result, sorted
  topN: number;                               // default positiveCount

  // allocation
  totalCapital: number;                       // explicit USDC input (D6)
  allocation: AllocationEntry[];              // derived from selected ranking + totalCapital

  // flags / errors
  backtestRunThisSession: boolean;
  starting: boolean; startError: string;
  configuring: boolean; configureError: string;
  resetting: boolean; resetError: string;
  chaosError: string | null;
}
```

**Derivation rules (for reducer/selectors, not stored redundantly where avoidable):**
- `ranking` = `result.worlds` mapped → sorted by `pnlPercent` desc, `selected = (rank <= topN)`.
- `allocation` = selected worlds → `weight = pnl/Σpnl`, `allocatedUsdc` via largest-remainder; recompute when `topN`/`totalCapital`/selection change.
- `blocked` set true only when `result.blocked`; cleared on re-run or strategy change.

---

## 5. Usability & Accessibility

**Heuristics:** status visible (concurrency badge + auto-scroll + progress bar) ✅; user control (Back/Retry/CTAs) ✅; error prevention (§2 block before review) ✅; recognition (labels carry SYM·TF·STG, PnL-sorted) ✅; minimalist (separate concerns per step) ✅.

**A11y checklist (WCAG AA):**
- [x] Semantic: `<label htmlFor>` on every input (capital input, top-N input, timeframe chips group `role="group"`+`aria-label`).
- [x] Multi-select listbox `role="listbox" aria-multiselectable`, rows `role="option" aria-selected`; keyboard ↑/↓/Space/Esc.
- [x] Chips: removable buttons with `aria-label="Remove {strategy name}"`; grouped with `role="list"`.
- [x] ARIA live: progress grid container `aria-live="polite"` for status changes; block panel `role="alert"`.
- [x] Keyboard nav + visible focus rings on all interactive (chips, rows, inputs, CTAs); focus moves to block CTA on block.
- [x] Not color-only: PnL shows sign `+`/`-` and ✓/✗; positive/non-positive divider is labeled, not just colored.
- [x] Contrast: use `--color-*` tokens; green/red meet AA on card bg (verify `#22c55e`/`destructive` on `bg-[var(--color-card)]`).
- [x] Auto-scroll only the grid `ref` (`scrollTop`), never `scrollIntoView` (avoids scrolling ancestors — matches `LiveDashboard:328-333`).
- [x] Touch targets ≥ 24×24 (chips/rows/inputs already ~h-10/16px min).
- [x] Landmarks: wizard is inside existing `<main>`; step region could carry `aria-current="step"`.

---

## 6. Handoff Notes for Frontend Engineer (F2–F5)
- **F2 (SetupWizard restructure):** new step union + remove single-strategy from `BotConfigPanel` + replace blind auto-advance with block-aware routing.
- **F3 (StrategyMultiSelect):** new component + shared strategy fetcher; chips + a11y listbox.
- **F4 (WorldRankingPanel + CapitalAllocationPanel):** sorting, top-N picker, PnL-weighted split (largest-remainder), D6 explicit-capital note.
- **F5 (AutoSelectGrid rework):** subcomponent extraction (no BotMetrics/BotControls breakage), concurrency badge, auto-scroll ref, token restyle; extend `useAutoSelectProgress` payload to V2.
- **Backend contract dependency:** `/api/bot/configure` must accept `worlds[]` (strategyId/source per world) — coordinate with backend task for D1/D4. `result.blocked` + `positiveWorlds` are required for §2.
- **Open (D6):** capital is explicit input; do not wire live `getBalance` (stub) into allocation math.

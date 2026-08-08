# DESIGN-MIRO-DARK-UX — Interaction Layer for the Miro-Dark System

> **Companion to `DESIGN-MIRO-DARK.md`** (UI token + component recipes — owned by Frontend UI Designer).
> This file owns **interaction states, motion, accessibility, responsive behavior** — the UX layer the token recipes are raised against.
> Status: **alpha, decision-ready**. Reviewed against `DESIGN.md` (Miro craft) and current `index.css`.

---

## 0. Reading This Doc

| Lane | File | Owns |
|------|------|------|
| 🧑‍🎨 UI Designer | `DESIGN-MIRO-DARK.md` | Color/typography/radius/shadow **values** per state |
| 🧭 UX Designer (this) | `DESIGN-MIRO-DARK-UX.md` | **Which states exist, how they behave, motion, a11y, responsive** |

**Ground rules taken from `DESIGN.md` (unchallenged):**
- Miro's no-hover policy: default + pressed/active are the documented states → this spec **adds** hover, focus-visible, disabled, and loading as the interaction layer the UI owner must value.
- Buttons are full pills (`{rounded.full}`) — never softened.
- Motion: 150–200ms ease **extracted as the system standard** (was a Known Gap in DESIGN.md).
- Touch targets ≥ 44px effective (button-md 14px label).
- ✅ **ACCEPTED:** WCAG 2.1 AA contrast on the dark matrix is a hard requirement.

**Removal mandate:** every trace of the legacy system is out — including the old rose accent (`--accent-primary`) used today for focus rings and run buttons. Its replacement is the UI owner's value; the **behavior contract** below is this file's job.

---

## 1. UX Operating Principles (Operate mode)

This is a **trading dashboard** — mode = *Operate*. Users scan, act, correct. Expression is subordinate to speed and trust.

1. **The run is sacred.** Running a backtest / starting the bot is the primary bullet on its surface. It is findable, focused, and never ambiguous about state.
2. **State is visible.** Every async operation (bot run, backtest, save, test-connection) exposes: idle → running → done/failed. No silent starts, no silent stops.
3. **Dark ≠ invisible.** On a dark matrix, contrast and focus are the *default* visual language, not a special case.
4. **Recognition over recall.** Panel shortcuts (1–5) are discoverable (badge in TopBar), never the only path.
5. **Errors are recoverable.** Every error carries a retry path or an explanation; no dead ends.
6. **Motion is signal, not décor.** Transitions explain *where things went*; they never delay or obscure.

---

## 2. State Coverage — Per Component

### 2.1 Button (pill) — 7 states

| State | Behavior contract | Notes for UI owner |
|-------|-------------------|--------------------|
| **Default** | Full pill, resting surface | Brand primary CTA color family |
| **Hover** | Surface lightens / elevation +1 | Subtle only; never layout shift |
| **Active (pressed)** | Visual "press": surface darkens / 1px inward | `:active` + **`aria-pressed`** when the button is a toggle |
| **Focus-visible** | 2px outline, offset ≥2px, visible on dark, on **all** surfaces | Ring must clear any surface; never `outline: none` without a replacement |
| **Disabled** | Not just muted: **`aria-disabled="true"`, `pointer-events: none`**, label retains ≥3:1 vs surface | Keep label legible — disabled ≠ invisible; include `title`/helper why |
| **Loading** | Spinner + label persist (width-stable), **`aria-busy="true"`** on the control, clicks ignored | Don't swap label to "…" alone — keep action name |
| **Keyboard** | Enter **and** Space trigger; focus ring persists while pressed | See §4.3 |

Rules: icon buttons = same 7 states, but focus ring **must** wrap the full circle (not the glyph). Circular icon buttons render 44×44 min on this surface (up from Miro's 36 desktop — dark matrix legibility).

### 2.2 Input — 7 states

| State | Behavior contract |
|-------|-------------------|
| **Idle** | Resting border, clear affordance it's editable |
| **Placeholder** | Distinct from entered text; **placeholder ≠ label** — every field has a visible `<label>` or `aria-label`; placeholder is never the only hint |
| **Focus-visible** | 2px ring (same standard as buttons), replaces border, no layout shift (1px border → 2px ring must be offset, not expand) |
| **Hover-border** | Border lightens on hover — optional but consistent across ALL inputs |
| **Disabled** | `aria-disabled` / native disabled, 3:1 min against surface, no pointer |
| **Readonly** | Native `readonly` semantics; visually distinct from editable (subtle surface) but **not** muted to disabled levels |
| **Error** | Error message **linked** to the field via `aria-describedby`; field marked `aria-invalid="true"`; message survives validation, reachable by keyboard (focus moves to first error or message has focusable link) |

Numeric/strategy-param inputs: stepper buttons (spinners) must be 44px targets, keyboard-operable (↑/↓ adjust when focused).

### 2.3 Sidebar — 5 states + keyboard

| State | Behavior contract |
|-------|-------------------|
| **Collapsed (rail, 64px)** | Icon + label-badge only; labels hidden but present for SR (`aria-label` per item) |
| **Expanded (220px)** | Persistent width; item labels visible; active item highlighted |
| **Active nav** | `aria-current="page"` on the active item; visual indicator (bar/color) — **not** color alone |
| **Keyboard expand** | Focus on rail + **ArrowRight** expands; **ArrowLeft** collapses; Enter activates item |
| **Hover** | **Preview-only, never required**: hover may preview-expand for mouse users, but the *persistent* expand is a click/toggle (see §7.3) |
| **Escape** | **Escape collapses** an expanded sidebar and returns focus to the expanded-from item |

Transition between rail ↔ expanded is 150–200ms (motion-safe) — see §3.

### 2.4 Modal / popup / overlay (CodeEditor, QuickAdder, Confirm)

| Requirement | Contract |
|-------------|----------|
| **Focus trap** | Tab/Shift+Tab cycle inside the dialog; nothing behind is focusable |
| **Escape close** | Escape closes; restore focus to the trigger |
| **`aria-modal="true"`** | On the dialog container; background inert to AT |
| **Initial focus** | On the **first actionable** element (field, primary button), never the container |
| **Restore focus** | On close, focus returns to the element that opened it |
| **Label** | `aria-labelledby` → dialog title; `aria-describedby` → description when helpful |
| **Backdrop** | Click-outside closes *only* if the operation is cancellable; destructive confirmations require explicit confirm |

Editor overlay (CodeEditor): save shortcut `Ctrl/Cmd+S` works while trapped; dirty-state guard on Escape ("discard changes?") — never silent data loss.

### 2.5 Tabs & panel switcher

| Pattern | Contract |
|---------|----------|
| **Panel switcher (1–5)** | Global document-level shortcut; **not** ARIA tabs — it switches *routes/panels*, so treat as navigation: each panel is a `role="region"` with `aria-label` ("Backtest", "Settings", …). Shortcut hint visible in TopBar (discoverability). |
| **In-panel tabs** (Backtest settings, strategy editor) | **Roving `tabindex`**: only the active tab is in the tab order; **Arrow keys** (Left/Right, Home/End) move selection; `aria-selected` reflects state; panel = `role="tabpanel"` + `aria-labelledby` the tab |

Toggle pills (run-mode, currency pairs): `role="switch"` or `aria-pressed` button — one pattern per control type, never both.

### 2.6 Toast / Badge / StatusDot

| Element | Contract |
|---------|----------|
| **StatusDot** | Visual pulse/glow is **decoration only** — state must be conveyed by text (`aria-label`) + a live region. Never color/glow alone (2.5% of users have CVD). |
| **Async updates** | `aria-live="polite"` live region for **meaningful transitions** only: bot started/stopped, backtest completed, trade executed. |
| **Rate limit** | ❌ **Never announce every tick.** Queue + coalesce: max 1 announcement per ~2s; ticks collapse into the latest value. |
| **Error console** | New non-blocking error → polite. New **blocking** error (compile failed, connection lost) → `role="alert"` (assertive). |
| **Badges** | Counts (`ErrorConsole: 3`) are text, not color. Badge text ≥3:1 on its fill. |

---

## 3. Motion System

### 3.1 Duration & easing tokens

| Token | Value | Use |
|-------|-------|-----|
| `motion-duration-micro` | 100–150ms | Leave, collapse, dismiss, press feedback |
| `motion-duration-base` | **150–200ms** | Standard state transitions: hover, focus, active, border color |
| `motion-duration-enter` | 150–250ms | Enter states: panels, modals, dropdowns, sidebar expand |
| `motion-duration-leave` | 100–150ms | Leave states: panel swap, modal close, sidebar collapse |
| `motion-easing` | **ease-out** (default); ease-in-out only for loops (spinner) | Never linear; never bounce/spring on this surface |

> Extracted from DESIGN.md Known Gap → **system standard**: 150–200ms ease-out base.

### 3.2 Motion inventory (per element)

| Element | Enter | Leave | Continuous |
|---------|-------|-------|------------|
| Panel switch (1–5) | 150–250ms fade/slide 8px | 100–150ms fade | — |
| Modal | 150–250ms fade + 8px rise | 100–150ms fade | — |
| Sidebar expand/collapse | 150–200ms width | 100–150ms width | — |
| Button hover/active | — | — | 150ms color/transform |
| StatusDot | — | — | Pulse — **killed under reduced motion** |
| Loading spinner | — | — | Loop — reduced-motion: slow or static |
| Hover-lift on cards | — | — | 150–200ms transform |

### 3.3 Reduced motion (`prefers-reduced-motion`)

| Directive | Behavior |
|-----------|----------|
| Duration | All transitions → **0ms** (instant) or ≤120ms crossfade (opacity only) |
| Transform motion | Parallax, slide, rise, hover-lift, width animation → **disabled**; crossfades only |
| Continuous | Pulse, glow, shimmer, indeterminate sweep → **off** (static state or slow, non-flashing) |
| Fallback | If an indeterminate progress bar is disabled, render **determinate** progress (real %) or a static "Running…" with `aria-busy` |

**Engineer hook (recommendation, not CSS):** expose two utility classes — `.uib-motion-safe` (default, applied at root) and `.uib-motion-reduce` (applied to root when the reduced-motion media query matches). Components gate their motion on the root class. Spinners/loops additionally honor the media query directly.

---

## 4. Accessibility Contract (WCAG 2.1 AA on dark)

### 4.1 Contrast expectations — REQUIRED MINIMUMS (values owned by UI designer)

| Pair | Type | Required ratio |
|------|------|----------------|
| `ink` (body text) on `canvas` | Normal text | **≥ 4.5:1** |
| `muted` (secondary text) on `surface` | Normal text | **≥ 4.5:1** — if a "muted" value can't hold 4.5:1, it is *placeholder-only*, never body/metadata |
| Button label `on-primary` on `primary` | Normal text | **≥ 4.5:1** |
| `stat-display` (64px) on `canvas` | Large text (≥24px / 18.66px bold) | **≥ 3:1** |
| Input border / focus ring vs adjacent surface | UI component | **≥ 3:1** |
| Disabled label on disabled surface | Normal text | **≥ 3:1** (not zero-contrast) |
| Badge text on badge fill | Normal text | **≥ 4.5:1** (captions are small) |
| Placeholder on input surface | Normal text | **≥ 4.5:1** preferred; visible label must exist regardless |

⚠️ **Re-test required on dark:** every pair above that currently passes on white (Miro's marketing tokens) **must be re-measured** on the dark matrix — e.g. `muted` and `hairline` boundaries that rely on light-surface contrast will fail on dark. The UI owner re-derives values; this contract fixes the *floor*.

### 4.2 Focus-visible standard

- **Every** interactive element: `:focus-visible` → 2px outline, ≥2px offset, color with **≥3:1 vs the surface it sits on**.
- Same ring style on all surfaces (canvas, panel, elevated, overlay) — consistency is the standard.
- Never suppressed (`outline: none`) without a visible replacement.
- Current legacy gap: `index.css` only styles focus for `.backtest-panel button` + quick-adder search, and uses the legacy rose accent → replace with the system ring everywhere (see §8).

### 4.3 Critical keyboard flows

| Goal | Path | Contract |
|------|------|----------|
| Open/switch panel | **1–5** (or Tab → sidebar → Enter) | Focus lands on the panel's first interactive element or a named region; shortcut hint visible |
| Run backtest | Tab to primary Run button → **Enter/Space** | Button has focus ring; `aria-busy` during run; completion announced (§4.4) |
| Edit script | Open CodeEditor (panel action) → edit → **Ctrl/Cmd+S** | Focus trapped; save feedback visible + announced |
| Dismiss dialog | **Escape** | Closes; focus restored to trigger; dirty-guard for editor |
| Navigate sidebar | Tab to rail → **ArrowRight/Left** expand/collapse → **Enter** activate | Active item `aria-current="page"`; Escape collapses |
| Navigate in-panel tabs | **Arrow keys / Home / End** | Roving tabindex; `aria-selected` |
| Dismiss toast/error | **Escape** or close button focusable | Announcements never block input |

### 4.4 Screen reader announcements

| Event | Region / role | Copy guidance |
|-------|---------------|---------------|
| Backtest run completes | `role="status"` (polite) on results summary | "Backtest finished. 3,214 trades. Net profit +12.4%." |
| Bot state changed | `role="status"` (polite) | "Trading bot started" / "stopped" / "paused" |
| Trade executed | polite, **rate-limited** | "Buy 0.5 BTC at 62,400" — never every tick |
| New error (blocking) | `role="alert"` (assertive) | "Strategy failed to compile: line 42." |
| New error (non-blocking) | polite, rate-limited | "Connection re-established." |
| Loading | `aria-busy="true"` on container + one polite "Loading…" | Skeleton must not be announced repeatedly |

### 4.5 Per-component ARIA expectations (tabIndex/role — guidance, not code)

| Component | Expected |
|-----------|----------|
| Button | Native `<button>`; toggle → `aria-pressed`; loading → `aria-busy`; disabled → `aria-disabled` |
| Input | Native input + visible label or `aria-label`; error → `aria-invalid` + `aria-describedby` |
| Sidebar item | `role="navigation"` container; item `aria-current="page"`; expanded state on toggle `aria-expanded` |
| Modal | `role="dialog"` + `aria-modal="true"` + `aria-labelledby`; trap + restore |
| Panel | `role="region"` + `aria-label`; tab panel pairs with tab `aria-controls` |
| StatusDot | `aria-label="Bot running"` + live region; glow never the sole signal |
| Toast | `role="status"` (info) / `role="alert"` (blocking error) |

### 4.6 Checklist (design AND review)

- [ ] Semantic elements / landmarks: `<header>` TopBar, `<nav>` sidebar, `<main>` content
- [ ] Every interactive element keyboard-reachable + operable (Enter/Space)
- [ ] Focus visible everywhere, consistent, ≥3:1
- [ ] Labels associated (visible label or `aria-label`), placeholder ≠ label
- [ ] Error messages linked `aria-describedby`
- [ ] Modals trapped, Escape, initial + restore focus
- [ ] Tabs roving tabindex + arrows
- [ ] Contrast: all text ≥4.5:1, large/UI ≥3:1, disabled ≥3:1
- [ ] Alt text for images/icons (decorative icons `aria-hidden`)
- [ ] Touch targets ≥44×44 (rail items, icon buttons, steppers)
- [ ] Reduced motion honored
- [ ] Live regions rate-limited; no per-tick announcements

---

## 5. Empty / Loading / Error / Partial States Workshop

The app today shows blank panels and raw text. Level all four states to this contract.

### 5.1 Empty (no data yet)

| Panel | Empty-state contract |
|-------|----------------------|
| **Dashboard/TradingBot** | "No trades yet" — icon + 1-line why + primary CTA (Run first backtest / Start bot) |
| **Statistics** | "Run a backtest to see statistics" + link to Backtest |
| **TradeHistory** | "No executed trades" + when the bot runs, trades appear here |
| **StrategyResults** | "No results yet" + CTA "Run backtest" (primary bullet) |
| **ErrorConsole** | "All clear" — never a blank dark box; state `aria-live` polite on *new* entries only |

Empty ≠ disabled: every empty state has a next action. No dead ends.

### 5.2 Loading (skeleton)

- Skeleton placeholders **match final layout** (stat blocks, rows, chart frame) — no raw "Loading…" text alone.
- Container `aria-busy="true"`; one polite "Loading…" announcement; no repeated announces.
- Under reduced motion: static skeleton (no shimmer).
- Deterministic where possible: backtest shows **progress %** (indeterminate sweep only when % is unknowable).

### 5.3 Error

- **Inline banner** (not only console): `role="alert"` for blocking, polite for advisory; dismissible (`aria-label="Dismiss"`), focusable.
- **Retry pattern**: every transient error carries Retry (primary on banner) + Cancel; retry re-runs the same params (no re-entry).
- Message = what failed + what the user can do. Never raw exception text as the user-facing copy.
- Form errors: inline per-field, `aria-describedby`, focus moves to first error.

### 5.4 Partial / stale

- Stale data (bot paused, results from old params): visible **"as of 14:32"** timestamp; never present stale as live.
- Partial results (backtest with warnings): show what succeeded + collapsible warning list; the run is not silently truncated.
- Offline/connection lost: banner + StatusDot state change; data remains readable, writes disabled with reason.

---

## 6. Responsive Futures (UX contract — no code change today)

The app is desktop-first (overflow hidden, no media queries). This section **defines the future contract**; nothing here alters current code.

| Breakpoint | Behavior |
|------------|----------|
| **≥1280 (base, today)** | TopBar 48px; sidebar rail 64px (hover/click expand 220px); panels 1–5; full stat-display |
| **1024–1279** | **Sidebar auto-collapses to rail** (64px); breadcrumb bar truncates with `title`; panel grids go 2-up → 1-up; stat-display scales down one step |
| **768–1023** | **Single column panels**; TopBar condenses (hide secondary actions behind menu); sidebar becomes overlay drawer (click/hamburger, focus-trapped when open); touch targets bump to ≥44px |
| **480–767** | Single column, full-width inputs; CodeEditor overlay full-screen; tables horizontal-scroll with sticky first column; stat-display scales to ≤48px |
| **<480** | Touch-first; icon buttons ≥44px; drawer full-screen; all pills full-width |

Contract rules: no feature is unreachable at any breakpoint; keyboard flows (§4.3) unchanged across breakpoints; reduced-motion applies everywhere.

---

## 7. Interaction Redesign Opportunities

### 7.1 Backtest → Results flow ⭐ primary

**User's job:** configure a strategy, run it, judge whether it's worth trading.

**Today:** run and results are separate panels; completion is easy to miss; iterating requires re-navigation.

**Target flow:**
1. Configure in Backtest (params persist across runs — SSOT).
2. **Run** (primary bullet) → `aria-busy`, progress visible.
3. On complete → results panel **auto-activates** (panel switch + 150–250ms enter), completion announced politely, summary card (trades, net profit, drawdown) at top.
4. "Re-run" replaces "Run" (same params) with last-run timestamp; results refresh in place — no re-navigation.
5. Chart on Results is interactive: hover crosshair + keyboard-accessible data points (arrow keys) for SR users.

**Friction removed:** completion visibility, iteration cost, param drift between runs.

### 7.2 Telegram config flow

**User's job:** connect the bot to Telegram and verify it works before trusting alerts.

**Target flow:** single page, not multi-step: fields (token, chat id) → inline validation on blur → **"Save & Test connection"** primary → explicit states: `Testing…` (aria-busy) → `Connected ✓` (green, polite announcement) / `Failed ✗` (inline error + Retry). Persist on save; connection state shown on the panel after reload.

**Friction removed:** blind saves, no way to verify, dead-end failures.

### 7.3 Sidebar hover-expand → click-expand (recommend: hybrid)

**Problem today:** hover-expand is mouse-only, motion-heavy, and traps pointer users into accidental expansion; no keyboard parity.

**Contract:** rail by default. **Click/toggle expands persistently** (220px, 150–200ms). Hover may *preview* expand for mouse users but is never required and never traps. **Keyboard:** ArrowRight expands, ArrowLeft collapses, Escape collapses + restores focus. State `aria-expanded` on the toggle.

### 7.4 Strategy run button prominence

**Contract:** the Run action is the **primary bullet** on its surface — highest contrast fill, full pill, first in action order, one place only. During run: disabled with `aria-busy`, label persists, progress shown. Never two competing run buttons in one viewport. Empty states route to it.

### 7.5 Error console priority

**Contract:** errors are surfaced in three tiers: (1) StatusDot + TopBar badge count — glanceable; (2) polite/alert announcement for blocking events; (3) full ErrorConsole panel with filter (errors/warnings/info). Severity never color-only. New blocking error can briefly auto-open the console or animate the badge — not both.

### 7.6 Empty states (leveled in §5)

Every panel gets a designed empty state with a next action — no raw blank, no raw text.

---

## 8. Review Findings — Current Implementation

| # | Screen / element | Current behavior | Finding | Severity |
|---|------------------|------------------|---------|----------|
| F1 | Global | Legacy rose accent used for focus ring + run buttons | Violates removal mandate; replace with system ring/primary | 🔴 High |
| F2 | All interactive | Focus-visible only on `.backtest-panel button` + quick-adder | Inconsistent focus standard; keyboard users can't see focus elsewhere | 🔴 High |
| F3 | StatusDot | Glow-only status | Fails non-visual communication (CVD + SR) | 🟠 Med |
| F4 | Sidebar | Hover-expand only | No keyboard parity, no Escape, pointer-trappy | 🟠 Med |
| F5 | Global | No `prefers-reduced-motion` handling | Pulse/shimmer/expand can't be disabled | 🟠 Med |
| F6 | Overlays | Editor/QuickAdder have no focus trap contract | SR/keyboard can escape; restore not guaranteed | 🟠 Med |
| F7 | Placeholder text | `#666` placeholder on `#1e1e2e` | Contrast failure (see §4.1) | 🟠 Med |
| F8 | Panels | Blank/raw-text states | Empty/Loading/Error states not leveled | 🟡 Low–Med |
| F9 | Tabs | No roving tabindex/arrow contract | Keyboard tab nav unmanaged | 🟡 Low |

---

## 9. UX Heuristics & Review Checklist (design AND review)

1. **Visibility of system status** — every async op exposes idle/running/done/failed; stale data stamped.
2. **Match real world** — trading vocabulary, no jargon-only labels; confirm destructive actions.
3. **User control & freedom** — Escape everywhere; re-run, retry, undo-style paths; no dead ends.
4. **Consistency & standards** — one focus ring, one press pattern, one toggle pattern per control type.
5. **Error prevention** — inline validation on blur; param persistence; dirty-guard on editor.
6. **Recognition over recall** — shortcuts visible (TopBar badge); empty states teach next action.
7. **Flexibility & efficiency** — 1–5 panel shortcuts + full mouse path; re-run shortcut.
8. **Aesthetic & minimalist** — flat cards, subtle hover-elevation only; motion = signal; no décor.

A11y checklist: §4.6.

---

## 10. Definition of Done (for implementation waves)

- [ ] All components implement the state matrix of §2 (7-state buttons, 7-state inputs, sidebar/modal/tab contracts)
- [ ] Focus-visible standard shipped globally (2px, offset, ≥3:1, all surfaces)
- [ ] Motion tokens applied; reduced-motion honored (0ms/crossfade; pulse+shimmer+lift off)
- [ ] Contrast floors of §4.1 verified on dark (body ≥4.5:1, large/UI ≥3:1, disabled ≥3:1)
- [ ] Critical keyboard flows of §4.3 pass end-to-end (Playwright user-behavior flow)
- [ ] SR announcements rate-limited; no per-tick speech
- [ ] Empty/Loading/Error/Partial states leveled on all 9 panels
- [ ] Legacy rose accent removed; no trace of old system remains
- [ ] Review findings F1–F9 resolved or explicitly scheduled

---

*UX layer of the Miro-Dark system — values live in `DESIGN-MIRO-DARK.md`. Questions on flows/behavior land here; questions on tokens land there.*

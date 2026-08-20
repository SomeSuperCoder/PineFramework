# Landing Page + Navigation Flow — UX Journey Spec

**Feature:** Landing page (new view) + navigation state machine + TopBar triggers
**Owner:** UX Designer · **Lane:** journey, IA, interaction states, a11y, acceptance criteria
**Status:** ✅ GO — ready for Frontend UI Designer (visual spec) + Frontend Engineer (implementation)
**References:**
- Behavior contract: `openspec/changes/landing-page-and-nav-flow/specs/landing-page/spec.md`
- Architecture: `openspec/changes/landing-page-and-nav-flow/design.md` (D1–D7)
- Incumbent truth: scout facts (`data/handoffs/team/core/scout/scout.json`), `App.tsx`, `ControlPanel.tsx`, `TopBar.tsx`, `theme/motion.ts`, `main.css`
- **Motion tokens are LAW:** exactly 3 durations (fast 150ms / base 200ms / slow 250ms), exactly 2 easings (enter `cubic-bezier(0.16,1,0.3,1)` / exit `cubic-bezier(0.3,0,0.8,0.15)`), stagger stepMs 40 / maxOffsetMs 100. No new tokens anywhere, including the landing.

---

## 0. Navigation State Machine (the contract that drives every journey)

Two pieces of state: the **view** (`'landing' | 'app'`, App-level React state, D1) and the persisted **entered flag** (`pine-landing-entered` in localStorage, D2).

| # | Event | Before | Action | After (view) | After (flag) |
|---|-------|--------|--------|--------------|--------------|
| S1 | App load, no flag | — | synchronous lazy init reads flag | `landing` | absent |
| S2 | App load, flag = `'1'` | — | synchronous lazy init reads flag | `app` | `'1'` |
| S3 | App load, flag unreadable / garbage | — | try/catch → safe default | `landing` | absent (treated) |
| T1 | Click **Get Started** (on landing) | `landing` | `setItem('1')` → `setView('app')` | `app` | `'1'` |
| T2 | Click **About** (in TopBar) | `app` | `removeItem(...)` **before** `setView('landing')` | `landing` | cleared |
| T3 | Click **logo** (in TopBar) | `app` | `removeItem(...)` before `setView('landing')` | `landing` | cleared |
| T4 | Click **app name / wordmark** (in TopBar) | `app` | `removeItem(...)` before `setView('landing')` | `landing` | cleared |

**Rules baked into the machine:**
- The flag is read **synchronously before first render** (lazy `useState` initializer, D2) → no landing→app flash for returning users.
- `removeItem` fires **before** `setView('landing')` (D2) → a reload racing the switch already sees the cleared flag (Journey 6 holds).
- Only the exact value `'1'` means "entered". Any other value (garbage, `'false'`, `'0'`) = not entered → landing.
- localStorage throwing (private mode / quota): read failure → default `landing` (harmless); write failure → session still switches views, just doesn't persist. Never crash.
- **No router, no URL/back-button semantics** (D1): browser Back does not navigate between landing and app. Out of scope by decision — do not add hash/query handling.
- Transitions are idempotent (pure localStorage ops + `useState`) → React StrictMode double-invoke safe.

**View-switch consequence to know (by design, D3):** `view === 'app'` renders `<ControlPanel>`, `view === 'landing'` renders `<LandingPage>` — they are mutually exclusive, so switching unmounts the other. Entering the app after a landing visit **remounts** ControlPanel: bot WebSocket reconnects, indicators refetch, chart reloads, `activePanel` resets to `'dashboard'`. This is accepted additive behavior (the panel itself is unchanged); QA must not read it as a regression.

---

## 1. The Six Journeys

### Journey 1 — First-ever open → LANDING
- **Entry:** user opens the app URL; no saved state (first run, cleared storage, private mode read failure).
- **State:** flag absent → `view = landing`; rendered instantly (no flash of the panel).
- **What the user SEES:** the full-viewport landing page — hero (headline, one-line value prop, brand-yellow **Get Started** CTA), 2–3 scroll-reveal sections on glass surfaces, footer CTA. No app shell chrome (no TopBar/Sidebar/dashboard). Content fits ~2 screens: hero above the fold, sections + footer CTA below.
- **Interactions available:** scroll (reveals), Get Started (→ Journey 2). That's it — no app chrome, no other navigation.
- **Exit:** Get Started (→ J2). Browsing the page does not change state.

### Journey 2 — Get Started → MAIN PANEL + persist
- **Entry:** user on landing (J1 or J6), activates **Get Started** (click, or Enter/Space when focused).
- **Transition (T1):** `setItem('pine-landing-entered','1')` → `setView('app')`. Synchronous — no loading spinner, no async gap (there is nothing to wait for).
- **What the user SEES:** the main panel replaces the landing: TopBar (now with clickable logo/name + About), Sidebar, dashboard toolbar + chart, `activePanel` at its default `'dashboard'`. Panel content fades in (existing `FadeIn` behavior).
- **Focus:** programmatic focus moves to the app shell (TopBar, `tabIndex={-1}`) — not lost to `<body>`.
- **Exit:** reload → J3; About/logo/name → J4/J5.

### Journey 3 — Reload after entering → MAIN PANEL (default)
- **Entry:** user has entered (flag = `'1'`), any subsequent page load (reload, new tab, later visit).
- **State:** synchronous flag read before first render → `view = app`. **No landing flash.**
- **What the user SEES:** the main panel directly, exactly as they left the app shell (dashboard default; indicator/chart data re-fetches as today).
- **Exit:** About/logo/name → J4/J5.

### Journey 4 — About button → LANDING (flag resets)
- **Entry:** user in the main panel; clicks **About** in the TopBar right spacer.
- **Transition (T2):** `removeItem(...)` **before** `setView('landing')`.
- **What the user SEES:** the landing page replaces the whole app shell (TopBar included — it lives inside ControlPanel). Scroll resets to top: hero visible.
- **Focus:** programmatic focus moves to the landing `<main>` `h1` (`tabIndex={-1}`).
- **Exit:** reload → J6 (landing again, because the flag is cleared); Get Started → J2.

### Journey 5 — Logo / app-name click → LANDING (flag resets)
- **Entry:** user in the main panel; clicks the **logo** or the **app name/wordmark** in the TopBar left block.
- **Transition (T3/T4):** same as J4 — `removeItem(...)` before `setView('landing')`. The logo + wordmark are **one click target** (a single `<button>` wrapping both, D4), so clicking either half behaves identically.
- **What the user SEES / Focus / Exit:** identical to J4.

### Journey 6 — Next load after About/logo → LANDING again (reset honored)
- **Entry:** user reached landing via J4 or J5 (flag cleared) and the page loads again (reload).
- **State:** flag absent → `view = landing`.
- **What the user SEES:** the landing page again. The "landing revisited resets the load default" rule holds.
- **Exit:** Get Started → J2 (and the cycle repeats: next reload after that → app).

### Dead ends? None.
Every state has at least one exit: landing always offers Get Started; app always offers About/logo/name. localStorage failure degrades to landing (safe default), never a blank screen.

---

## 2. Interaction States

Motion discipline (applies to everything below): one authored reveal language, mapped onto the existing tokens. No per-section bespoke effects (craft-floor Motion rule). All durations/easings from `theme/motion.ts`.

### 2.1 Get Started button (primary CTA, hero + footer)
| State | Spec |
|---|---|
| Default | Brand yellow `#ffd02f` fill, near-black `#0d0d18` text (contrast ≈ 11:1), bold, `h-12` (48px — satisfies the ≥44px height law). Neobrutalist: high-contrast, confident. Optional arrow/chevron icon (lucide, consistent stroke). |
| Hover | `#fcb900` (existing `yellowHover` token — no new color). Cursor pointer. |
| Focus-visible | Visible focus ring: `ring-2 ring-[#ffd02f] ring-offset-2 ring-offset-background` (or the project's shadcn focus-visible pattern). Ring must be visible against both dark bg and glass. |
| Active (pressed) | Press affordance: `translate-y-0.5` (neobrutalist press) at `fast` 150ms / `exit`-family feel. No color inventing beyond tokens. |
| Loading | **None — by design.** The transition is a synchronous localStorage write + state switch; there is no async work. Do NOT add a spinner/disabled state (a new motion token would violate the LAW). |
| Keyboard | Native `<button>`: Enter/Space activate. First/last interactive element on the page in a sensible tab order (hero CTA early). |

### 2.2 About button (TopBar right spacer)
| State | Spec |
|---|---|
| Default | Existing shadcn `Button` variant consistent with the shell (e.g. `outline` or `ghost`), label **"About"** (visible text — no aria-label needed). Height `h-10` (40px, compact law) or `h-11`; the TopBar is `h-12` so it sits comfortably in the `min-w-[160px]` right spacer. |
| Hover / Focus-visible / Active | Follow the chosen shadcn variant's existing states + the same focus-ring rule as 2.1. |
| Keyboard | Native button; Tab reaches it within the TopBar order (logo/name first, then About, then shell controls). |
| Role/action | In-app view switch — a `<button>`, never an `<a>` (no router). |

### 2.3 Logo + app-name click target (TopBar left block)
| State | Spec |
|---|---|
| Default | ONE `<button>` wrapping the existing logo `<img>` (keep `aria-hidden="true"` — decorative) + the "Pine Framework" wordmark (keep the brand-yellow `#eab308`/yellow treatment). Full-height hit area (`h-12`, ≥44px). Cursor pointer. |
| Hover | Subtle, restrained: wordmark brightens toward `#ffd02f` and/or logo gets a faint yellow glow — no scale bounce, no new tokens. |
| Focus-visible | Same focus-ring rule as 2.1/2.2. |
| Active | `translate-y-0.5` press at `fast` 150ms. |
| Keyboard | Native button; Enter/Space activate. **Tab order: this is the first interactive element in the app shell** (top-left, before About and shell controls). |
| A11y | `aria-label="Pine Framework — open landing page"` — the visible wordmark alone ("Pine Framework") does not convey the *action* (go to landing); the label must. The img inside stays `aria-hidden="true"`. |

### 2.4 Scroll-reveal behavior (framer-motion `whileInView`)
- **Trigger:** each section reveals once as it enters the viewport: `viewport={{ once: true, margin: '-80px' }}`. `once: true` = sections do NOT re-animate on scroll-back (calmer, honors the "restrained" half of FeralUI).
- **Language:** one coherent system — sections enter with translate-y (~16–24px) + opacity 0→1, at `base` 200ms, `enter` easing. Multi-element reveals within a section stagger using the existing stagger rhythm (stepMs 40 / maxOffsetMs 100). Glass surfaces may additionally fade in their backdrop-blur (motion may reach past transform/opacity per craft-floor — blur is allowed when smooth, never animated blur).
- **Focal moment:** the hero (headline + Get Started) is the one authored moment that may be bolder; everything below follows the same quiet reveal. No parallax by default.
- **Reduced motion (WCAG 2.3.3):** honor `prefers-reduced-motion` — sections render **fully visible immediately** (no transform, no opacity animation, no parallax). ⚠️ The global CSS guard in `main.css` zeroes *CSS* animations/transitions, but framer-motion runs *JS* animations — the landing MUST gate via the existing reduced-motion hook (`ui/motion/use-reduced-motion.ts`) or framer-motion's `useReducedMotion`. Do not rely on the CSS guard alone.
- **No new tokens:** every duration/easing above is from `theme/motion.ts`. Hard constraint.

### 2.5 Focus management (landing ↔ app switches)
| Switch | Focus target | Why |
|---|---|---|
| Landing → app (Get Started) | App shell: TopBar (`tabIndex={-1}`, programmatic `.focus()`) | Focus must not fall to `<body>` (WCAG 2.4.3); TopBar is the stable shell landmark. |
| App → landing (About / logo / name) | Landing `<main>` `h1` (`tabIndex={-1}`, `.focus()`) | SR users get page context ("Pine Framework — heading level 1") before tabbing to the CTA. |
| Same-view tabbing | Natural DOM order; never `tabindex` > 0 on landing | No focus trap — the landing has no modal. |

Scroll position: on app→landing, scroll resets to top (hero). Landing→app: ControlPanel remounts fresh (its scroll containers start at top) — no manual reset needed.

### 2.6 Keyboard navigation (landing)
- Everything interactive is a real `<button>` / `<a>` — never `div onClick`.
- Tab order: Get Started (hero CTA) → section content (if any inline links) → footer CTA. Skip link recommended if a header/nav exists on landing ("Skip to content").
- No modal, no Escape handler needed, no focus trap.
- App shell unchanged: existing 1–4 panel shortcuts and `/` quick-add continue to work **only in the app view** (see Finding F-2).

---

## 3. Accessibility Notes (WCAG)

- **Contrast on glass:** translucent fills sit over near-black `#0d0d18` — keep text hierarchy on glass at `ink 1` `#ededf5` / `ink 2` `#c2c2d0` (body ≥4.5:1, large text ≥3:1). Muted text (`muted-foreground` ≈ `#a8a8a8`) is AA-safe on dark glass but must NEVER sit on bright (yellow) surfaces. Yellow is a fill/glow/accent, not a text-on-light carrier — dark text on yellow (≈11:1) is the only pairing on yellow fills. Never gray-out text on colored glass; tint from the surface hue (craft-floor).
- **Focus rings:** every interactive element (Get Started, About, logo/name, footer links) has a visible `:focus-visible` ring — brand-yellow ring with offset, distinguishable from both dark bg and glass. This is WCAG 2.4.7 + 2.4.13.
- **aria labels:** logo/name button `aria-label="Pine Framework — open landing page"` (action must be announced); logo `<img>` inside stays `aria-hidden="true"`. About has visible text — no label needed. Any icon-only control (if a landing nav/menu appears) needs `aria-label`.
- **Semantic headings:** exactly one `h1` on the landing (product name + value prop); `h2` per section; no skipped levels. Footer CTA is a heading or strong CTA, not a new `h1`.
- **Landmarks:** `<header>` (if a landing top row exists), `<main>` (the landing content), `<footer>` (footer CTA). The app shell already has its own landmarks; the two views never render together.
- **Touch targets:** ≥44px on all interactive elements (Get Started `h-12`, About ≥`h-10`, logo/name `h-12`, footer links padded).
- **Reduced motion:** see 2.4 — no scroll animation, no parallax, no auto-scroll; content available without motion.
- **Screen reader flow:** load → SR announces landing heading + CTA; Get Started → focus moves to app shell; About/logo → focus moves to landing heading. The view switch is communicated by the focus move (no aria-live noise needed for a synchronous switch).

---

## 4. Acceptance-Criteria Table (QA verification)

Setup for ALL rows: localStorage cleared per test (`page.addInitScript` or context clear) so `pine-landing-entered` is deterministic; backend stubbed (`page.route`) + FakeWebSocket per house E2E mandate.

| # | Spec requirement / scenario | How to verify | ✅ PASS criterion |
|---|---|---|---|
| A1 | Req 1 · First-ever open → landing (spec: landing page rendered on first open) | Clear storage, load app | Landing page visible (`main` with hero + Get Started CTA); main panel chrome (TopBar / Sidebar / dashboard) **not** rendered |
| A2 | Req 2 · Scroll animation (spec: scroll animation scenario) | Scroll through landing | Each section below the fold is initially hidden/opaque and reveals progressively as it enters the viewport; reveal completes once (no re-animation on scroll-back) |
| A3 | Req 2 · Liquid glass surfaces (spec: liquid glass surfaces scenario) | Inspect landing render | At least the hero uses translucent blurred glass surfaces (backdrop-blur + translucent fill + hairline border) with brand-yellow accent present (CTA + at least one glow/accent) |
| A4 | Req 2 · Reduced motion respected (spec: reduced motion scenario) | Emulate `prefers-reduced-motion: reduce` (Playwright `page.emulateMedia`) | Sections are fully visible without scroll-triggered transforms/parallax; no scroll animation plays |
| A5 | Req 2 · Motion token LAW | `git diff` of `theme/motion.ts` + grep landing for durations/easings | `theme/motion.ts` unchanged: exactly 3 durations / 2 easings; landing uses only those values |
| A6 | Req 3 · Get Started enters main panel (spec: enter via Get Started) | On landing, click Get Started | Main panel displayed (TopBar + dashboard visible); `pine-landing-entered` === `'1'` in localStorage |
| A7 | Req 3 · Entered state persisted | After A6, reload | Main panel displayed again — landing not shown (also covers Req 4) |
| A8 | Req 4 · Page loads default to main panel after entering (spec: reload after entering) | Enter app, reload (and open a new tab → same origin) | Main panel displayed; landing not rendered; no landing flash on load |
| A9 | Req 5 · About button opens landing (spec: about from main panel) | In main panel, click About | Landing displayed; `pine-landing-entered` absent from localStorage |
| A10 | Req 6 · Logo click opens landing (spec: logo click) | In main panel, click the logo (left block) | Landing displayed; flag cleared |
| A11 | Req 6 · Name click opens landing (spec: name click) | In main panel, click the wordmark | Landing displayed; flag cleared (same single click target as A10) |
| A12 | Req 7 · Landing revisited resets load default (spec: next load after About / after logo) | Reach landing via About (A9) or logo (A10), then reload | Landing displayed again — the cleared flag makes landing the load default |
| A13 | Req 8 · Main panel unchanged (spec: dashboard still fully functional) | Enter app (A6), exercise panels | All existing panels (dashboard / bot / telegram / backtest), overlays, chart interactions, `/` quick-add (in app view), and 1–4 panel shortcuts behave as before — no regression |
| A14 | Interaction · Focus on view switch | Enter app via Get Started; keyboard-audit `document.activeElement` | After Get Started: focus is inside the app shell (TopBar), not `<body>`; after About/logo: focus is on the landing `h1`/`main` |
| A15 | Interaction · Keyboard operability | Tab through landing + TopBar triggers; activate with Enter/Space | Every landing CTA and the TopBar logo/name + About are reachable by Tab and activate with Enter/Space |
| A16 | Interaction · Touch targets | Measure hit areas (devtools / a11y scan) | Get Started ≥48px, About ≥40px, logo/name ≥48px, footer links ≥44px |
| A17 | A11y · Focus visibility | Keyboard-tab every control | `:focus-visible` ring visible on every interactive element (against dark bg AND glass) |
| A18 | A11y · Labels & semantics | axe / manual SR audit | Logo/name button has an action-bearing `aria-label`; one `h1`; `main`/`header`/`footer` landmarks present; no unlabeled interactive controls |
| A19 | A11y · No flash on reload | Enter app, reload while watching first paint (or unit-test the lazy initializer) | View resolves to app on first render; no landing→app flash |
| A20 | Edge · Garbage / unreadable flag | Set `pine-landing-entered` to a non-`'1'` value (e.g. `'0'`, `'banana'`); reload | Landing displayed (only `'1'` means entered) |
| A21 | Edge · View switch races reload | Click About and immediately reload (or rely on unit test of removeItem-before-setView) | Landing displayed after reload (flag cleared before the switch commits) |

QA note: A19/A21 are timing-sensitive for E2E — they may be verified more reliably by unit tests (Test Engineer) on the `useLandingGate` lazy initializer + transition ordering; E2E covers the deterministic rows (A1–A18, A20).

---

## 5. UX Findings (non-blocking, for Tech Lead routing)

| ID | Severity | Finding | Screen / step | Suggested owner |
|---|---|---|---|---|
| F-1 | Medium | **`/` quick-add fires on the landing.** `handleSlashKey` is a window listener registered in `App.tsx` with no view guard; overlays (QuickAdderPopup) are always-mounted. A keyboard user pressing `/` on the landing gets the QuickAdder popup over the landing — confusing, and it can open the editor. | Landing, any keyboard use | Frontend Engineer — gate the handler (and/or overlay mount) on `view === 'app'`; spec 3.2.1 On Focus + 3.2.2 consistency |
| F-2 | Low | **App remount on re-entry re-syncs state.** Coming back from landing via Get Started remounts ControlPanel → WS reconnect, indicator refetch, `activePanel` reset to dashboard. Accepted by D3, but a user may notice a brief reconnect. | J2 (re-entry after J4/J5) | Frontend Engineer — no change needed now; document in release notes. If it bothers users later, lift ControlPanel above the view switch (defer). |
| F-3 | Info | **No URL/back-button semantics by decision (D1).** Browser Back from the app does not return to landing. Acceptable per spec; do not add routing. | All | — |
| F-4 | Info | **PRODUCT.md absent** (impeccable `init` not run). This brief + the spec/design files capture product truth for the landing. Recommend `$impeccable init` when a design-system pass happens. | — | Frontend UI Designer / Tech Lead |

---

## 6. Constraints honored (checklist)

- [x] Motion tokens LAW — 3 durations / 2 easings only; zero new tokens
- [x] Dark oklch theme + brand yellow `#ffd02f` (+ `#fcb900` hover — existing)
- [x] No router — view-state machine, no URL/back-button semantics
- [x] ~2 screens of content (hero + 2–3 sections + footer CTA)
- [x] FeralUI language: raw/neobrutalist boldness (Get Started, press states, high contrast) + restrained liquid-glass (D6 Tailwind primitives) + scroll motion (D5, reduced-motion-safe)
- [x] Main panel behavior untouched (A13); landing purely additive
- [x] TopBar triggers thread through the optional `onShowLanding` prop (D4); existing consumers compile unchanged
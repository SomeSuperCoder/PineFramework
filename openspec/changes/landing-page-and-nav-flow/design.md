# Design: Landing Page + Navigation Flow

## Context

The frontend is a single-page React 18 + Vite + Tailwind v4 + shadcn app with **no router**. The app shell is a state machine: `App.tsx` renders `<ControlPanel>` which switches panels via `activePanel` state. `TopBar` is presentational and rendered inside `ControlPanel`. The theme is a dark oklch palette with a brand yellow accent (`#ffd02f`), Inter font, and a motion-token LAW (3 durations / 2 easings — no new tokens allowed). See proposal.md for motivation and specs/landing-page/spec.md for the behavior contract.

## Goals / Non-Goals

**Goals:** a first-class landing view with scroll animation + liquid-glass styling; a persisted landing/app navigation state machine; TopBar triggers (About button, clickable logo/name); framer-motion added as a project dependency; unit + Playwright E2E proof of the 6 navigation behaviors.

**Non-Goals (design-level):** no router migration; no main.tsx changes; no i18n; no design-system token extraction; no feral-blob/feral-fur packages; no backend/chart/PineScript changes; no change to existing dashboard behavior.

## Decisions

### D1. View state machine, not a router
Implement `view: 'landing' | 'app'` as an App-level React state, gated by a `useLandingGate` hook at the composition root (`App.tsx`).

- **Why:** the app already runs as a state machine (`activePanel`); adding react-router (or hash routing) for exactly two views is disproportionate, and the directive is *flag-driven* (behavior depends on persisted state), not URL-driven. Deep links / back-button semantics are not required.
- **Alternatives considered:** react-router (rejected — new dependency, URL/back-button semantics not required, larger blast radius), hash routing (`#/landing`) (rejected — same cost, no user-visible benefit here).

### D2. Persisted "entered" flag via localStorage
`useLandingGate` owns a single flag key `pine-landing-entered`. Transitions:
- `Get Started` → `setItem('pine-landing-entered','1')` + `setView('app')`
- `About` / logo/name click → `removeItem(...)` **before** `setView('landing')` (so a reload triggered around the switch already sees the cleared flag)
- Initial state read via a **synchronous lazy initializer** in `useState` (not an effect) to eliminate first-paint flash; wrapped in try/catch (localStorage may throw in private mode / storage-full) with a safe default of `view: 'landing'` on read failure.

- **Why:** localStorage is the smallest mechanism that survives reloads and matches "default on next page load" semantics; a synchronous initializer avoids a landing→app flash.
- **Alternatives considered:** sessionStorage (rejected — must survive new tabs/sessions? directive says "page load", localStorage is the honest persistence), URL search param (rejected — violates no-URL-driven requirement, pollutes address bar), IndexedDB (rejected — overkill for one flag).

### D3. `useLandingGate` hook + dumb `LandingPage` component
- `useLandingGate()` returns `{ view, enterApp, showLanding }`.
- `App.tsx`: `view === 'landing' ? <LandingPage onGetStarted={enterApp} /> : <ControlPanel ... onShowLanding={showLanding} />`.
- `LandingPage` is presentational — receives `onGetStarted` as a prop, no global state, no localStorage access. Keeps ControlPanel internals unaware of the landing (modularity: dependency injected at the composition root).

### D4. TopBar triggers threaded through ControlPanelProps
`ControlPanelProps` gains an optional `onShowLanding?: () => void` (default no-op). `ControlPanel` passes it to `TopBar`. TopBar renders:
- an **About button** in the currently-empty right spacer (`min-w-[160px]`) — shadcn `Button` variant consistent with the shell;
- the logo + wordmark wrapped in a `<button>` (not `<a>` — no router; in-app state change) with an `aria-label` for accessibility.
- **Why thread-through:** TopBar is presentational and rendered inside ControlPanel; the only consumer is `App.tsx`, so the radius is one optional prop + one render site. Optional-with-default keeps existing tests and any other TopBar consumers compiling unchanged.

### D5. Framer-motion for scroll animation only
Add `framer-motion` (motion) to `frontend/package.json`. LandingPage uses viewport-triggered `motion` components (`whileInView` / `viewport={{ once: true }}`) for scroll-reveal of sections. All durations/easings map onto the existing motion tokens — **no new tokens** (motion LAW). Respect the existing reduced-motion guard (disable/limit transforms under `prefers-reduced-motion`).

- **Why:** the standard React animation library; React 18 compatible; small, tree-shakeable surface for reveal-on-scroll; integrates with Tailwind v4 class composition.
- **Alternatives considered:** GSAP (rejected — heavier, more API surface than needed for scroll-reveal), pure CSS + IntersectionObserver (rejected — more bespoke code, less cohesive motion language; still used as fallback for the glass entrance), tw-animate-css only (rejected — utility animations, no viewport-triggered reveal).

### D6. Liquid-glass built from Tailwind v4 primitives
Glass surfaces use the established Tailwind v4 pattern: `backdrop-blur-*` + translucent fills (`bg-white/5`-class) + hairline borders (`border-white/10`) + layered depth (gradient overlays, soft shadows, brand-accent glows). A small set of reusable class strings lives with the Landing components (not extracted into the design system — deferred). Blur radii stay restrained for performance and Safari correctness.

- **Why:** zero new dependencies, consistent with the existing Tailwind v4 setup, no glass library needed for two screens' worth of surfaces.
- **Alternatives considered:** a `@utility glass` in CSS (deferred to design-system work), glassmorphism component library (rejected — dependency bloat for a landing page).

### D7. FeralUI = design language, not a dependency
FeralUI is a real project (feralui.dev) but offers physics widgets (claw-captcha, jelly blob, hologram card), **not** a landing/glass system. The landing honors the name as an in-house design language: **raw/neobrutalist boldness + restrained liquid-glass + scroll motion**, using the existing brand yellow on dark oklch. `feral-blob` / `feral-fur` packages are **not** installed (could be an optional flourish later).

## Risks / Trade-offs

- [First-paint flash of the wrong view] → synchronous lazy initializer in `useState`; flag read before first render.
- [localStorage throws (private mode / quota)] → try/catch around all storage access; on read failure default to `landing` (harmless — user clicks Get Started); on write failure the session still works, just doesn't persist.
- [React StrictMode double-invokes effects] → transitions are idempotent (set flag / clear flag are pure localStorage ops; view state is plain `useState`).
- [TopBar consumers break on new prop] → optional prop with default no-op; existing tests compile unchanged.
- [E2E hits the real backend] → Playwright tests stub the network (`page.route`) and use a `FakeWebSocket`; no real backend queries, per house mandate; localStorage cleared per test for deterministic state.
- [framer-motion bundle weight] → import only the `motion` primitives used; no whole-library barrel import.
- [Safari backdrop-blur perf] → restrained blur radii, few large glass surfaces, no animated blur.

## Migration Plan

Single commit at the feature boundary (`feat: landing page + navigation flow`). Rollback = revert the commit; the app falls back to the previous always-dashboard behavior (no data risk). No backend/deploy steps.

**Landing v2 increment** (interactive shadcn charts, FeralUI pullcord/feral-blob integration, advanced framer-motion scroll/hover effects, landing-only Day Session light theme) is a second commit on top of the same feature (`feat: landing v2 — interactive charts + FeralUI + advanced motion`). Rollback = revert the v2 commit; v1 landing remains intact. The v2 design delta is recorded in frontend/DESIGN.md §7/§8/§10/§12/§13 and in the landing spec + tasks of this change.

## Open Questions

None — all decisions above are resolved and consistent with the specs.
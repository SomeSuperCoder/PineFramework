# Design — Animations & Transitions Pass

## Decisions

### D1. CSS-first motion system — zero new dependencies
tw-animate-css 1.4.0 is installed but barely used (only 1 hit in main.css; shadcn primitives ship `animate-in/out` data-state classes that are commented out). Framer-motion is NOT installed and we deliberately do not add it. All motion is CSS transitions/keyframes + tiny React wrappers. Rationale: motion here is decorative enhancement — CSS is cheaper, faster, and honors `prefers-reduced-motion` for free. A full animation library would be dependency weight for zero added capability.

### D2. Tokens: 3 durations, 2 easings — single source of truth
- Durations: `--motion-fast: 150ms`, `--motion-base: 200ms`, `--motion-slow: 250ms`
- Easings: enter `cubic-bezier(0.16,1,0.3,1)` (fast ease-out — snappy arrival), exit `cubic-bezier(0.3,0,0.8,0.15)` (ease-in — quick departure)
- Defined in `@theme` in `src/main.css` AND exported as TS constants in `src/theme/motion.ts`.
- Rule: components reference tokens, never hardcode durations/easings. No per-component keyframes except the one required ProgressBar fix.

### D3. Primitives: FadeIn + Stagger, enhancement-not-gating
- `FadeIn`: mount-only, opacity 0→1 + translateY(8px)→0, duration `--motion-slow`? No — `--motion-base` (200ms) for panels, `--motion-fast` (150ms) for small elements. Renders children visible immediately (no initial hidden state that blocks content if CSS fails). This is critical: content must NEVER be gated behind animation completion.
- `Stagger`: wraps children, applies capped per-child delay (max ~100ms offset), stops staggering under reduced motion.
- Both wrappers read `useReducedMotion()` and render plain (no transform) when the user prefers reduced motion.

### D4. Reduced motion — one global guard, not per-call-site
```css
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
Plus Tailwind `motion-reduce:` variants where a specific behavior must be suppressed (e.g., Stagger delays, hover transforms). `useReducedMotion` hook guards `window.matchMedia` against undefined (jsdom).

### D5. View transitions — enter-only via the remount choke point
`ControlPanel.tsx:86-92` keys the panel payload by `key={activePanel}` → every panel switch fully remounts. That is the SINGLE choke point: wrap the panel container in `FadeIn` keyed to `activePanel` for a 200ms enter fade on every view switch. Enter-only: exit-on-unmount would require an unmount-delay wrapper (measure/focus hazards, complexity) — out of scope, flagged as follow-up.

### D6. Overlays — radix data-state + tw-animate-css (free exit animations)
The shadcn pattern already in the codebase (dialog.tsx, alert-dialog.tsx, dropdown-menu.tsx, tooltip.tsx, select.tsx, popover.tsx have commented `data-[state=open]:animate-in` classes): re-enable with the motion tokens.
- Overlay: `animate-in fade-in-0 duration-200`
- Panel: `animate-in fade-in-0 zoom-in-95 duration-200` (enter), `animate-out fade-out-0 zoom-out-95 duration-150` (exit)
- Proof pattern on `ui/dialog.tsx` FIRST (M1), propagate to the other 5 overlays in M3. Zero JS — radix data-state drives enter AND exit.

### D7. Interaction feedback — restrained hover/active
- Buttons, nav items, cards, table rows, tabs, toolbar buttons: `transition-colors duration-150` (or `transition-transform duration-150` only where a 1-2px lift or scale is tasteful — buttons `hover:-translate-y-0.5` sparingly, cards `hover:scale-[1.01]`).
- Active: `active:scale-[0.98]` on buttons (tactile press feedback).
- Hover is color/transform only — never layout-affecting (no width/height animation except the existing Sidebar width transition which stays).

### D8. Charts are motion-excluded (perf law)
- Custom canvas chart (PineChart.ts + renderers) — CSS transitions don't apply and must not be wrapped in motion.
- recharts stats/backtest charts — no animation props (`isAnimationActive` stays off / default), no motion wrappers on chart containers.
- LiveDashboard WebSocket-driven metric values — NO transitions on the values themselves; mount-only fade on the panel container only.
- Rule for M2: fade the *container*, never the data.

### D9. ProgressBar keyframes bugfix (scout-verified)
`ProgressBar.tsx:62,88` use `animate-[backtest-indeterminate_1.5s_ease-in-out_infinite]` but no `@keyframes backtest-indeterminate` exists anywhere — the indeterminate animation silently never runs. Define the keyframes (a translateX sweep, ~1.5s ease-in-out infinite, motion-reduce:animate-none already present) as part of the motion system.

## Scope boundaries (who touches what)

| Owner | Files |
|-------|-------|
| M1 animations-engineer | `src/theme/motion.ts` (new), `src/main.css` (@theme tokens + reduced-motion guard), `src/components/ui/motion/*` (new: FadeIn, Stagger, useReducedMotion), `src/components/ui/dialog.tsx` (proof pattern), ProgressBar keyframes |
| M2 frontend-engineer | Domain components only: `ControlPanel.tsx`, `ContentArea`, `Sidebar.tsx`, `LiveDashboard`, panel components, tab panels, list mounts |
| M3 frontend-ui-designer | `ui/` primitives only (except dialog.tsx): alert-dialog, popover, dropdown-menu, select, tooltip, collapsible, button, card, table, tabs, badge, skeleton |
| M4 ux-designer | Review-only a11y/reduced-motion audit of all touched files |

## Risks / Trade-offs

1. **Chart perf** — mitigated by D8 (charts excluded from motion; containers only).
2. **Exit animations** — radix overlays get them free via data-state; view switches are enter-only (no unmount-delay wrapper). Trade-off: view exits won't animate — acceptable for this pass.
3. **Scope creep** — the token+primitive system is the control: 3 durations, 2 easings, no per-component keyframes (except ProgressBar), no framer-motion, no springs/parallax.
4. **Test breakage** — FadeIn renders content visible immediately (animation never gates content) → component tests don't wait on animation completion. M5 verifies.
5. **Reduced motion** — D4 global guard + D3 primitives read the hook → a11y path guaranteed.

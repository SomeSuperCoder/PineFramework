# Animations & Transitions Pass

## Problem Statement

The PineFramework frontend feels static: content appears/disappears abruptly, panel switches snap, dialogs pop open without motion, and interactive elements give no visual feedback. The Director wants the app to feel "alive" — a tasteful, professional motion pass.

## Proposed Change

Introduce a small CSS-first motion system and apply it across the frontend (React 18 + Vite + Tailwind v4 + shadcn/radix + tw-animate-css, already installed but underused):

1. **Motion tokens** — durations (fast 150ms / base 200ms / slow 250ms) and exactly 2 easings (enter `cubic-bezier(0.16,1,0.3,1)`, exit `cubic-bezier(0.3,0,0.8,0.15)`) as `--motion-*` CSS vars in `@theme` + TS constants in `src/theme/motion.ts`.
2. **Motion primitives** — `FadeIn` (opacity + 8px translateY, mount-only, renders children visible immediately — animation is enhancement, never gating) and `Stagger` (capped ≤100ms offsets) in `src/components/ui/motion/`.
3. **Reduced motion** — ONE global `@media (prefers-reduced-motion: reduce)` guard zeroing durations + Tailwind `motion-reduce:` variants; `useReducedMotion` hook tolerating jsdom's missing `matchMedia`.
4. **View transitions** — enter-only fade-in on panel switch via the single remount choke point (`key={activePanel}` in ContentArea → full remount every switch). No unmount-exit for views (out of scope — no unmount-delay lib).
5. **Overlay animations** — enter+exit for Dialog / AlertDialog / Popover / DropdownMenu / Select / Tooltip via radix `data-[state=open|closed]` + tw-animate-css `animate-in/out` (the standard shadcn pattern, currently dormant). Pattern proven on `ui/dialog.tsx` first, then propagated.
6. **Interaction feedback** — restrained hover/active transitions on `ui/` primitives (button, card, table rows, tabs, tooltip, select) and key domain surfaces (sidebar nav, dashboard toolbar, bot controls).
7. **Bug fix (found in scout)** — `ProgressBar.tsx:62,88` references missing `@keyframes backtest-indeterminate`; the indeterminate animation never runs. Define the keyframes as part of the motion system.

## Non-goals

- No redesign of the visual identity or layout
- No changes to the PineScript engine / backend
- No framer-motion or any new dependencies (CSS-first)
- No motion on the custom canvas chart (PineChart.ts + renderers) or on WebSocket-driven metric values (LiveDashboard re-renders at high frequency — animating data is a stutter machine)
- No exit animations for view switches (enter-only this pass)
- No springs, parallax, overshoot easings, or playful effects
- No reduced-motion opt-outs — every animation has a `prefers-reduced-motion` path

## Affected Capabilities

- `frontend-application` — view switching / panel transitions
- `shadcn-component-layer` — overlay + interaction animations on ui/ primitives
- `design-system` — motion tokens + primitives added to the design system

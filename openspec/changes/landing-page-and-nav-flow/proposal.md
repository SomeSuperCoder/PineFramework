# Proposal: Landing Page + Navigation Flow

## Why

The Pine Framework app currently opens directly into the trading dashboard — a dense, technical surface with no introduction. New users are dropped into a complex panel with zero context about what the product is. A hypermodern, scroll-animated landing page gives the product a professional first impression, communicates its value, and provides an intentional entry point ("Get Started") into the main panel — while remaining fully optional for returning users.

## What Changes

- Add a new **landing page view** (`view: 'landing'`) rendered at app entry when the user has not yet "entered" the app: hypermodern design, scroll-animated sections, professional liquid-glass (glassmorphism) look, honoring the **FeralUI** design language (raw/neobrutalist boldness + restrained liquid-glass + scroll animation).
- Add a **landing/app navigation state machine** with persisted state:
  - First open (no saved state) → LANDING.
  - "Get Started" on landing → MAIN PANEL (current dashboard) + persist `entered` flag.
  - Any subsequent page load → MAIN PANEL (default, because landing was already seen).
  - **About button** on the top panel → LANDING.
  - Clicking **app name + logo** on the top panel → LANDING.
  - Landing reached via About/logo → `entered` flag resets, so the **next page load defaults to LANDING again**.
- Modify the **top bar** (TopBar.tsx): add an About button; make the logo + app name clickable to return to the landing.
- Add **framer-motion** (project dependency) for scroll-reveal animations only; use Tailwind v4 `backdrop-blur` + translucent surfaces for the liquid-glass look, mapped onto existing motion/theme tokens (motion LAW — no new durations/easings).
- Add **unit tests** (state machine) + **Playwright E2E user flows** proving the 6 navigation behaviors from the user's side.

## Capabilities

### New Capabilities
- `landing-page`: The landing view (visual design, scroll animation, liquid-glass styling, FeralUI design language) plus the landing/app navigation state machine (persisted `entered` flag, Get Started entry, About/logo return, load-default behavior) and the TopBar triggers (About button, clickable logo/name).

### Modified Capabilities
- None — `frontend-application` behavior is unchanged; the landing is additive.

## Impact

- **Frontend only:** `frontend/src/App.tsx` (view gate at composition root), `frontend/src/components/ControlPanel.tsx` (thread `onShowLanding` prop), `frontend/src/components/TopBar.tsx` (About button + clickable logo/name), new `frontend/src/components/Landing/` directory, new `useLandingGate` hook, new `frontend/e2e/landing.spec.ts`.
- **Dependencies:** add `framer-motion` to `frontend/package.json`.
- **No backend, no chart engine, no PineScript pipeline changes.**
- **Non-goals:** no router migration; no backend changes; no main.tsx change; no i18n; no design-system token extraction; no feral-blob/feral-fur packages (FeralUI is honored as a design language, not installed).
# Tasks: Landing Page + Navigation Flow

## 1. Design

- [x] 1.1 UX Designer — journey spec + acceptance-criteria table for the 6 navigation behaviors + landing interaction states
  - **Agent:** team/frontend/ux-designer
  - **Verdict:** ✅ GO
  - **Evidence:** journey + A1–A21 table at frontend/docs/landing-ux-journey.md; QA verified 21/21 PASS
  - **Date:** 2026-08-20

- [x] 1.2 Frontend UI Designer — new-work visual world (FeralUI design language: raw/neobrutalist boldness + restrained liquid-glass; brand yellow on dark oklch; Inter), seed PRODUCT.md + DESIGN.md
  - **Agent:** team/frontend/frontend-ui-designer
  - **Verdict:** ✅ GO
  - **Evidence:** frontend/PRODUCT.md + frontend/DESIGN.md (Feral Glass visual world); QA verified visual compliance
  - **Date:** 2026-08-20

## 2. Implementation

- [x] 2.1 Frontend Engineer — `useLandingGate` hook (synchronous lazy initializer, try/catch localStorage, idempotent under StrictMode), App-level view gate (`landing` | `app`), dumb `LandingPage` component, TopBar `onShowLanding` optional prop threaded via ControlPanelProps (About button + clickable logo/name)
  - **Agent:** team/frontend/frontend-engineer
  - **Verdict:** 🟢 GREEN
  - **Evidence:** typecheck + eslint pass; hook at frontend/src/hooks/useLandingGate.ts; gate at App.tsx; F-1 '/' guard applied (App.tsx:187)
  - **Date:** 2026-08-20

- [x] 2.2 Frontend Animations Engineer — add `framer-motion` dependency; scroll-reveal + restrained liquid-glass styling on LandingPage; map all transitions onto existing motion tokens (motion LAW — no new durations/easings); respect reduced-motion preference
  - **Agent:** team/frontend/frontend-animations-engineer
  - **Verdict:** 🟢 GREEN
  - **Evidence:** framer-motion ^13.1.1 in frontend/package.json; LandingPage 493 lines + motion-variants.ts + ScrollHairline.tsx; MotionConfig reducedMotion='user'; typecheck + eslint pass
  - **Date:** 2026-08-20

## 3. Test

- [x] 3.1 Test Engineer — unit tests for `useLandingGate` (lazy init, storage failure, all 6 behavior transitions, StrictMode idempotency) + Playwright `landing.spec.ts` proving the 6 user flows as behavior (first open → landing; Get Started → main; reload → main; About → landing; logo/name click → landing; reload after About/logo → landing again); localStorage cleared per test; network stubbed (page.route / FakeWebSocket) — real backend never queried
  - **Agent:** team/quality/test-engineer
  - **Verdict:** 🟢 GREEN
  - **Evidence:** Vitest 460/460 (12 new hook tests); Playwright 33 passed incl. landing.spec.ts 7/7 flows; 12 existing specs updated via e2e/helpers.ts enterAppDirectly
  - **Date:** 2026-08-20

## 4. QA

- [x] 4.1 QA Engineer — acceptance GO/NO-GO against the 6 behaviors + visual spec (brand yellow, dark oklch, liquid-glass restraint, motion LAW); consumes Test Engineer verdict, no suite re-run
  - **Agent:** team/quality/qa-engineer
  - **Verdict:** ✅ GO
  - **Evidence:** A1–A21 acceptance 21/21 PASS; visual spec verified (5 blurred surfaces, yellow discipline, motion LAW, reduced-motion); blast radius clean; 2 pre-existing unrelated failures noted, not blocking
  - **Date:** 2026-08-20
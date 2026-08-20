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
## 5. Design (landing v2)

- [x] 5.1 Frontend UI Designer — DESIGN.md v2 amendment: §13 Day Session light variant (landing-only token table + glass classes + PullCord integration), §7 advanced-motion mapping rows (6 effects → LAW tokens only, hard clamps), §12 un-ban (pullcord/feral-blob/recharts), §8/§10 a11y additions, contradiction reconciliation
  - **Agent:** team/frontend/frontend-ui-designer
  - **Verdict:** ✅ GO
  - **Evidence:** frontend/DESIGN.md 214 → 272 lines (+63/−5); amendment verified; no new motion tokens
  - **Date:** 2026-08-20

## 6. Implementation (landing v2)

- [x] 6.1 Frontend Engineer — install `pullcord` + `feral-blob`; root pnpm override `motion: ^13.1.1` (single runtime proof: `pnpm why -r motion` = motion@13.1.1 shared, motion@12.43.0 orphaned); split LandingPage.tsx (483 lines) into landing-charts.tsx + demo-data.ts + use-landing-theme.ts + landing-theme.css; interactive shadcn charts (hero Area, equity Area monotone, bot Bar sparkline — brand accent, activeDot/activeBar hover); PullCord landing-only light/dark toggle (data-landing-theme attr + scoped CSS vars, localStorage pine-landing-theme, reduced-motion noEntrance); JellyBlobMascot near bot panel (steel/ink, aria-hidden)
  - **Agent:** team/frontend/frontend-engineer
  - **Verdict:** 🟢 GREEN
  - **Evidence:** tsc --noEmit clean, prettier clean, production build GREEN (3146 modules); override resolution proven; accepted deviation: pullcord exposes aria-pressed (WAI-ARIA toggle-button pattern), not role=switch
  - **Date:** 2026-08-20

- [x] 6.2 Frontend Animations Engineer — six advanced effects per DESIGN.md §7: parallax (±24px hero / ±16px sections, useScroll+useSpring), scroll-scrub reveals, magnetic CTA (±4px, pointer:fine + reduced-motion gated), 3D tilt (≤6°, preserve-3d, hero + equity cards), whileHover glass (scale 1.01 + theme-remapped border/fill via --landing-hover-surface), hologram foil (ONE hero element, amber ≤0.15, pointer-events-none) — all mapped to motion LAW tokens, zero new tokens; explicit useReducedMotion gating (style-driven values bypass MotionConfig)
  - **Agent:** team/frontend/frontend-animations-engineer
  - **Verdict:** 🟢 GREEN
  - **Evidence:** tsc --noEmit clean, vite build green, impeccable detector [] zero findings; effects extracted to motion-effects.tsx; LandingPage.tsx 482 lines
  - **Date:** 2026-08-20

## 7. Test (landing v2)

- [x] 7.1 Test Engineer — unit: demo-data determinism (no Math.random at render), use-landing-theme persistence/fallback, 3 chart render smokes (15 new tests); E2E landing.spec.ts extended to 16 flows: 3 chart-hover tooltip proofs, PullCord flip/persist/aria-pressed, main-panel dark isolation, reduced-motion static effects, JellyBlobMascot visible + all 7 v1 flows intact; network stubbed (page.route /api/** + FakeWebSocket), localStorage cleared per test
  - **Agent:** team/quality/test-engineer
  - **Verdict:** 🟢 GREEN
  - **Evidence:** Vitest 42 files / 474 tests pass; landing e2e 16/16; full e2e 42/44 (chunk-boundary pre-existing flake + supertrend-3d retry-pass, both unrelated to the change); no production code touched
  - **Date:** 2026-08-20

## 8. QA (landing v2)

- [x] 8.1 QA Engineer — acceptance A1–A9 against the user's original request (interactive hover-reactive shadcn charts; FeralUI library actually used — PullCord + JellyBlobMascot; framer-motion advanced scroll/on-hover animations; landing-only theme; v1 nav state machine intact; reduced-motion + pointer:fine safety; DESIGN.md §13 verbatim; a11y; clean modules); consumes Test Engineer verdict, no suite re-run
  - **Agent:** team/quality/qa-engineer
  - **Verdict:** ✅ GO
  - **Evidence:** acceptance matrix A1–A9 all PASS; out-of-scope e2e flakes confirmed environmental, not blocking
  - **Date:** 2026-08-20

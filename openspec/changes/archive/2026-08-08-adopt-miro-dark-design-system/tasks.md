## 0. Design Foundation (W0)

- [ ] 0.1 Create `frontend/src/DESIGN-MIRO-DARK.md` — dark-adapted Miro design spec: 13 token categories (canvas, surfaces, hairlines, ink, steel, text scales, accents, pastels, semantic, radius, spacing, elevation, motion), chart palette section, component recipes (Button/Card/Input/Modal/Tab/NumberInput/ProgressBar), legacy-mapping table (old hex → new token), dark-only policy, AA contrast on dark, fallback font stack (owner: frontend-ui-designer + ux-designer)
- [ ] 0.2 Mark `frontend/src/CONTROL-PANEL-DESIGN.md` DEPRECATED header (owner: frontend-engineer)
- [ ] 0.3 Tech Lead + Director visual sign-off on DESIGN-MIRO-DARK.md before any token work

## 1. Token Layer + CSS Rewrite (W1)

- [ ] 1.1 Create `frontend/src/theme/tokens.ts` — typed Miro-dark token constants (all colors, radii, spacings, elevations, motion, type scale w/ fallback stack)
- [ ] 1.2 Rewrite `frontend/src/index.css` `:root` to mirror `theme/tokens.ts` (colors, surfaces, radii, spacing, elevation, motion)
- [ ] 1.3 Add mirror-consistency vitest test asserting `:root` values equal `tokens.ts` (RED on divergence)
- [ ] 1.4 Write one-time codemod (ast-grep/ts-morph) driven by legacy-mapping table: old hex → token reference across the 28 non-monolith components; flag ambiguous hex for human review
- [ ] 1.5 Run codemod — zero legacy hex in 28 components (grep-zero); ambiguous hits reviewed
- [ ] 1.6 Verify: tsc/lint clean, vitest green, hex count ≈ 0, mirror test green, pinned chart spec unchanged (lane guard: do NOT touch `src/chart/**`)

## 2. Monolith Split (W2 — parallel track, must precede restyle)

- [ ] 2.1 Stabilize exports — `TradingBotPanel.tsx` stays public entry re-exporting `TradingBotPanel`/`useBotWebSocket`/`LiveDashboard`
- [ ] 2.2 Extract `useBotWebSocket` → `hooks/useBotWebSocket.ts` (pure move, commit `refactor: extract useBotWebSocket`, vitest green + visual-regression unchanged)
- [ ] 2.3 Extract `LiveDashboard` → `components/LiveDashboard.tsx` (pure move commit)
- [ ] 2.4 Extract BotControls → `components/bot/BotControls.tsx` (pure move commit)
- [ ] 2.5 Extract BotStatusPanel → `components/bot/BotStatusPanel.tsx` (pure move commit)
- [ ] 2.6 Extract BotMetrics → `components/bot/BotMetrics.tsx` + shell cleanup (pure move commit)
- [ ] 2.7 Each chunk: vitest affected-green + visual-regression unchanged + Code Reviewer verdict per chunk; NO token/logic/visual changes in this wave

## 3. Primitive Layer + Absorption (W3)

- [ ] 3.1 Build primitive components consuming tokens only: Button, Card, Input, Modal/Surface, Tab, NumberInput, ProgressBar (`src/components/primitives/*`)
- [ ] 3.2 Absorb remaining inline styles into primitives across components (where a primitive category exists)
- [ ] 3.3 Restyle TradingBotPanel + extracted composables against new tokens (drain remaining hex)
- [ ] 3.4 Verify: primitives consume tokens only, monolith hex = 0, tsc/lint clean, vitest green

## 4. Chart Canvas Alignment + Single Re-baseline (W4)

- [ ] 4.1 Update `src/chart/types.ts` `DEFAULT_OPTIONS` (bg, text, grid, border, font) to import `tokens.chart.*`
- [ ] 4.2 Update PineChart.ts + renderers to consume token colors (no renderer-local hex)
- [ ] 4.3 Test Engineer runs pinned visual-regression → RED, capture diff image
- [ ] 4.4 QA Engineer reviews diff = token-driven color changes only (zero geometry) → sign off re-baseline
- [ ] 4.5 Update baseline with diff image attached to commit (the ONE sanctioned re-baseline); all 3 e2e green

## 5. Motion + A11y (W5)

- [ ] 5.1 Add motion tokens + micro-motion respecting `prefers-reduced-motion`
- [ ] 5.2 WCAG AA contrast audit on dark matrix (report ≥ AA: body ≥ 4.5:1, UI ≥ 3:1)
- [ ] 5.3 UX Designer sign-off on final flows

## 6. Final Verification + Deprecation (W6)

- [ ] 6.1 Full vitest suite green + full e2e (3 specs) green on re-baselined visuals
- [ ] 6.2 Repository grep-zero: no legacy hex in component source; no references to CONTROL-PANEL-DESIGN.md
- [ ] 6.3 Delete `frontend/src/CONTROL-PANEL-DESIGN.md`; confirm DESIGN-MIRO-DARK.md is the only design spec
- [ ] 6.4 Code-reviewer final verdict, QA GO, commit at feature boundary

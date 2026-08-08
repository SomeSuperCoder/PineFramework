## Why

The Director wants the PineFramework trading dashboard to look "god tier." The root `DESIGN.md` (a Miro marketing-design analysis: pill CTAs, tight type hierarchy, flat elevation, brand-yellow accent, pastel card tints) has been added to the repo but is currently unused by the codebase. Meanwhile the app's actual frontend spec (`frontend/src/CONTROL-PANEL-DESIGN.md`) defines an old, partially-adopted dark token system (`#0d0d18`/`#0f1520`/`#e94560`) consumed by only 1 of 28 components; the rest use 652 inline styles with hardcoded hex. The Director's directive: adopt Miro's design standards **adapted for a dark theme**, and **remove all trace of the old design system** (no fallback, no legacy tokens).

## What Changes

- **BREAKING** — Replace the old frontend design system (CONTROL-PANEL-DESIGN.md token set, `index.css :root` legacy values, all hardcoded legacy hex in component source) with a **single Miro-dark token source** (`frontend/src/theme/tokens.ts` + mirrored CSS vars). Old values are removed, not aliased.
- Introduce a new `DESIGN-MIRO-DARK.md` spec (dark-adapted Miro craft: pill CTAs `rounded.full`, radius scale 4–28, type hierarchy weights ≤600 with negative letter-spacing, flat elevation with strategic depth, brand-yellow as accent, dark-compatible pastel card tints, motion tokens) that becomes the single design truth.
- Build a reusable primitive layer (Button, Card, Input, Modal/Surface, Tab, NumberInput, ProgressBar) consuming tokens only, replacing per-component inline style-const objects.
- Split the 2768-line `TradingBotPanel.tsx` monolith into ~5 composables (behavior-neutral refactor) and restyle each component against the new tokens.
- Align the chart canvas palette (`src/chart/types.ts` `DEFAULT_OPTIONS` + renderers) with the same single token source, ending CSS/canvas divergence.
- Delete `frontend/src/CONTROL-PANEL-DESIGN.md` (grep-zero legacy hex + doc reference check first).
- Preserve every existing flow (bot, backtests, telegram, stats, trade history), keeping unit suites green and e2e/visual-regression intentionally re-baselined at the one sanctioned point (W4).

## Non-goals

- No light theme (this remains a dark-only app; the doc will explicitly bar future light overrides).
- No i18n/locale work (hardcoded strings found during the swap are reported, not fixed).
- No backend/API changes.
- No new features; strict visual/architecture lift only.

## Capabilities

### New Capabilities
- `design-system` (delta): the Miro-dark design system contract — token categories, primitive components, pill CTA rules, chart palette alignment, a11y AA on dark, motion/reduced-motion, and the "zero legacy hex" invariant.

### Modified Capabilities
- `frontend-application`: visual identity and component usage must resolve entirely from the new Miro-dark token source; legacy hardcoded styling is replaced by primitives/tokens.
- `dark-theme`: token values/dark surfaces are replaced by the Miro-dark palette (no residuals of the old control-panel palette).
- `token-registry`: token source moves to `frontend/src/theme/tokens.ts` with a mirror-consistency test enforcing single-source truth.

## Impact

- Frontend: `frontend/src/index.css`, all components in `src/components/`, shell (`TopBar`, `Sidebar`, `ContentArea`, `ControlPanel`), `src/App.tsx`/`AppToolbar.tsx` style records, `src/chart/*` palette, new `src/theme/tokens.ts`, `src/components/primitives/*`.
- Tests: existing vitest suites must stay green; `e2e/chunk-border-visual-regression.spec.ts` re-baselined once (QA-signed) at W4; all 3 e2e specs green at the end.
- Docs: `frontend/src/CONTROL-PANEL-DESIGN.md` deleted; `frontend/src/DESIGN-MIRO-DARK.md` added; root `DESIGN.md` referenced as the craft source.
- No backend, API, or dependency changes.
## Context

The frontend is a Vite 5 + React 18 + TS trading dashboard with a single global CSS file (`frontend/src/index.css`, 329 lines), a partially-adopted old dark token system (`#0d0d18`/`#0f1520`/`#e94560`), 652 inline `style={{}}` records across 28 components, and a 2768-line `TradingBotPanel.tsx` monolith. The chart canvas palette also lives hardcoded in `src/chart/types.ts` `DEFAULT_OPTIONS`, unconnected to CSS — a known divergence risk. A pinned visual-regression e2e (`e2e/chunk-border-visual-regression.spec.ts`) guards chart border rendering. See `specs/design-system/spec.md` and `specs/frontend-application/spec.md` for the requirements.

## Goals / Non-Goals

**Goals:**
- One typed token source (`frontend/src/theme/tokens.ts`) consumed by components AND the chart canvas, mirrored to CSS variables.
- Primitive component layer (Button, Card, Input, Modal, Tab, NumberInput, ProgressBar) consuming tokens only.
- Split the TradingBotPanel monolith into ~5 composables (behavior-neutral) before restyling.
- All inline style records migrate to token references via a codemod; zero legacy hex remains.
- Dark-only Miro craft typography/pills/pastels; chart palette aligned to the same tokens.
- Delete `frontend/src/CONTROL-PANEL-DESIGN.md` only after grep-zero gate.

**Non-Goals:**
- No light theme, no i18n, no backend changes, no new features.
- No CSS-in-JS library introduction (single CSS file + TS tokens is the standard).

## Decisions

1. **Single token source = TS module (`theme/tokens.ts`), CSS vars mirror it.**
   - *Why:* components use inline styles (can't read CSS vars), and the canvas (TS) imports tokens directly. A TS module is typed, importable, unit-testable.
   - *Alternatives:* CSS-first with `getComputedStyle` at runtime — rejected (runtime CSS-load dependency, untestable in vitest, per-frame cost). Pure CSS variables — rejected (inaccessible to inline styles/canvas).
   - *Enforcement:* a vitest test parses `:root` and asserts equality with `theme/tokens.ts` (RED on divergence).

2. **Codemod for the 652 inline styles.** The Design System Engineer writes a one-time codemod driven by the W0 legacy-mapping table (old hex → new token reference); ambiguous values are flagged for review, never guessed. Swap maps old hex → NEW token values as one atomic visual commit (visible intent); primitives absorb in W3.

3. **Monolith split strictly precedes restyle (W2 before W3).** Pure-move extraction: JSX + its styles + handlers move together; zero logic/visual changes inside the split; one commit per chunk, each green. Public entry keeps re-exporting `TradingBotPanel`/`useBotWebSocket`/`LiveDashboard` so existing imports don't break.

4. **Chart canvas alignment via token imports, not runtime CSS.** `DEFAULT_OPTIONS` fields (bg, text, grid, border, font) import `tokens.chart.*`. One intentional, QA-signed re-baseline of the visual-regression spec (diff reviewed = only token-driven color changes, zero geometry). W1 lane guard: the swap track must NOT touch `src/chart/**` until W4 so the pinned spec stays green; if the pinned region includes wrapper chrome, re-baseline that one spec earlier, QA-signed.

5. **Legacy doc deletion at the final gate.** `CONTROL-PANEL-DESIGN.md` is marked DEPRECATED at W0, physically deleted at W6 after repository grep shows zero references and zero legacy hex. The legacy mapping table lives inside `DESIGN-MIRO-DARK.md` so nothing is lost.

6. **Font strategy.** Roobert PRO (Miro's typeface) is commercial/unhostable → type *craft* is implemented on a documented fallback stack (`-apple-system, 'Segoe UI', Roboto, Inter, sans-serif`), weights capped ≤600, negative letter-spacing on display sizes — never blocking on font licensing.

## Risks / Trade-offs

- Visual-regression breakage → One sanctioned re-baseline at W4; W1 lane guard keeps pinned spec green; QA signs the diff image (token colors only, zero geometry).
- CSS/canvas divergence returns → `theme/tokens.ts` as single source + mirror-consistency vitest test; Code Reviewer enforces in gates.
- A11y contrast on dark pastel pills/yellow → W0 pre-computes AA-safe token values (≥4.5:1 text, ≥3:1 UI); W5 audits final matrix.
- Monolith split regression → pure-move rules, green per chunk, code-reviewer per chunk; proof = pinned spec unchanged.
- Scope creep/token sprawl → scope freeze after W0 sign-off; token governance (only spec'd tokens, no ad-hoc additions).

## Migration Plan

1. W0: produce `DESIGN-MIRO-DARK.md` (spec + legacy mapping), Director sign-off.
2. W1 ∥ W2: token layer + CSS rewrite + codemod swap of 28 components ∥ monolith split (disjoint files).
3. W3: primitives absorb inline-remaining styles; monolith restyle per new tokens.
4. W4: chart canvas aligns to tokens; single re-baseline of visual-regression.
5. W5: motion/reduced-motion + a11y AA audit.
6. W6: full verification, deprecate + delete old doc, grep-zero, commit.

Rollback: every wave is a commit boundary; revert the last commit if a gate fails. Token changes are additive on CSS (new values replace old in `:root`), so reverting one commit restores the previous state.

## Open Questions

None — Director decision (C + dark-adapted Miro + remove old system) is fixed; all architecture and design choices are resolved.

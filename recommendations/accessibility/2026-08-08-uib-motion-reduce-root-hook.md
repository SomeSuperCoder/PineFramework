# Add .uib-motion-reduce root-class hook (UX §3.3)
**Date:** 2026-08-08
**Source:** frontend-animations-engineer (M1, 491bbb4)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
`frontend/src/DESIGN-MIRO-DARK-UX.md` §3.3 recommends a `.uib-motion-reduce` root-class hook (JS adds the class when `matchMedia('(prefers-reduced-motion: reduce)')` matches). The CSS media-query guard (index.css:144) already handles CSS animations/transitions globally, so this is belt-and-suspenders for any future JS-driven motion (rAF loops, canvas anims).

## Rationale
Chart/canvas work may someday want JS-gated motion that a CSS guard can't stop. The root class gives JS a synchronous, testable hook.

## Evidence
- UX appendix §3.3 recommendation; the media-query guard exists but is CSS-only.

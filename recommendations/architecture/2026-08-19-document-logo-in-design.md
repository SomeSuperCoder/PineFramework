# Document "Pine Bars" logo in DESIGN.md
**Date:** 2026-08-19
**Source:** Frontend UI Designer
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Create a DESIGN.md (or design-tokens doc) documenting the "Pine Bars" brand mark: concept (pine tree built from 5 ascending price bars), colors (#ffd02f yellow + #ffffff wick for top bar; #12121f on #ffd02f plate for favicon), file locations (frontend/src/assets/logo.svg, frontend/public/favicon.svg/png), and usage rules (24x24 in top bar, aria-hidden decorative, 2-color max at small sizes).

## Rationale
No DESIGN.md exists in the repo (Scout verified). The frontend agents treat DESIGN.md as law when present — documenting the brand mark prevents future drift (e.g. someone re-adding a placeholder, or using #eab308 instead of brand yellow #ffd02f). Also standardizes the yellow discrepancy: TopBar wordmark still uses #eab308 while the mark uses brand #ffd02f.

## Evidence
- frontend/src/assets/logo.svg, frontend/public/favicon.svg, frontend/public/favicon.png (new, commit pending 2026-08-19)
- TopBar.tsx wordmark span still text-[#eab308] vs new logo #ffd02f

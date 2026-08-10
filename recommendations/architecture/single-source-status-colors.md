# Single-source status accent colors (#22c55e / #eab308) into theme tokens
**Date:** 2026-08-11
**Source:** QA Engineer
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Promote the hardcoded hex accents used for status semantics — `#22c55e` (success/connected green) and `#eab308` (brand yellow / debug amber) — into Tailwind v4 theme variables (e.g. `--color-success`, or reuse/extend existing tokens), and reference them from both `DashboardToolbar` active states and `TopBar`'s `StatusDot`.

## Rationale
`DashboardToolbar.tsx` uses `bg-[#22c55e]/10 text-[#22c55e]` (Auto Scale) and `bg-[#eab308]/10 text-[#eab308]` (Debug); `TopBar.tsx` uses the identical hexes for the logo and `StatusDot`. The two bars now share visual semantics (green = success, amber = brand/debug) but not the token. A future theme change touches three places instead of one. This is a small debt inherited from the pre-migration inline styles — the migration was a good opportunity to fix it.

## Evidence
`frontend/src/components/DashboardToolbar.tsx:175,196` and `frontend/src/components/TopBar.tsx:35-40,117-119`.
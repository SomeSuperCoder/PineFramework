# Landing v2 bundle size (1.33 MB production)
**Date:** 2026-08-20
**Source:** team/frontend/frontend-animations-engineer (non-blocking note)
**Priority:** low
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Chunk-split the frontend production bundle. Current production bundle is 1.33 MB, driven by recharts, pullcord, and feral-blob on the landing surface — a pre-existing cost amplified by the new interactive chart + FeralUI deps.

## Rationale
The landing page is the first-load surface; a 1.33 MB single chunk hurts LCP for the exact audience the landing is meant to impress. The landing charts and FeralUI components are only needed on the landing view, so they are natural candidates for code-splitting / lazy import.

## Evidence
- `pnpm --filter pine-framework-frontend build` output: production bundle 1.33 MB
- Deps added in landing-v2: recharts (already present), pullcord ^0.1.0, feral-blob ^0.1.0, motion@13.1.1 (override-forced single version)
- No motion regression — the size is dependency-driven, not animation-driven

## Suggested owner
frontend-engineer (chunk-splitting is the frontend engineer's lane), verified by performance-engineer.

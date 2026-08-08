# Extend weight-cap conformance scan to page components
**Date:** 2026-08-08
**Source:** Code Reviewer (plan 5.3, finding M1)
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
`frontend/src/__tests__/shadcn-bridge.test.ts` weight-cap conformance scan walks `ui/` components only. Extend the scan to `src/components/**` (converted page components) so DESIGN §6 (weight ≤600) regressions in converted files are caught by the tripwire.

## Rationale
The narrow scan scope is exactly why the `font-bold`/`fontWeight:700` violations shipped in converted files (fixed in fix wave but unguarded). The spec's weight scenario requires checking converted page components too.

## Evidence
- Code Reviewer M1: "weight test walks collectTsx(uiBase) only — exactly why B2 shipped"
- All weight violations swept in fix wave; the tripwire needs widening to prevent recurrence.

# App.tsx still has inline legacy hex (#64b5f6)
**Date:** 2026-08-08
**Source:** Code Reviewer (plan 5.3, out-of-scope finding)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
`frontend/src/App.tsx:542-543` still contains inline `#64b5f6`. The design-system spec's "repository-wide zero legacy hex" is not yet met repo-wide. Convert App.tsx's remaining inline styles to pf tokens in a follow-up.

## Rationale
§17 token law; the conversion's end state should be zero legacy hex repository-wide.

## Evidence
- Code Reviewer finding (out of scope for the conversion diff — App.tsx wasn't part of it)

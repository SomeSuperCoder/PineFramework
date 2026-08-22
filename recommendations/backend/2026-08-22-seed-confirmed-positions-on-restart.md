# Seed confirmedPositions from persisted non-flat state on restart

**Date:** 2026-08-22
**Source:** Code Reviewer (V3, F7) — multi-world-portfolio-trading change
**Priority:** high
**Status:** pending
**Effort:** medium (1-2hr)

## Recommendation
On bot restart, `confirmedPositions` (in-memory map keyed by world key) is never
reseeded from the persisted `strategy-state.json` non-flat entries. `getPositions()`
is confirmed-gated and is the close-on-stop set, so after a restart an open on-chain
position returns `[]` and a graceful stop sells 0 → stranded position.

Fix: in `loadState`/`initialize`, after loading persisted state, seed
`confirmedPositions` for every loaded non-flat position (mirroring how a live
confirmed buy populates it).

## Rationale
Money-safety: a graceful shutdown/restart must be able to liquidate every real
on-chain position. Today it cannot, for any position opened before the last restart.

## Evidence
Code Reviewer V3 handoff (data/handoffs/team/quality/code-reviewer/v3-backend.json),
F7. Pre-existing gap (confirmedPositions was always in-memory) — not introduced by
the multi-world change, but the rework touches loadState/initialize so it is the
right moment.

## Scope note
Flagged during multi-world-portfolio-trading; held as a separate follow-up (Director
decision) rather than bundled into that already-verified change.

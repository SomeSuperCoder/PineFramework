# SampleFeesCard commissionMethod prop is unused
**Date:** 2026-08-10
**Source:** Tech Lead review (W4); FE-3b agent observation
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
frontend/src/components/SampleFeesCard.tsx declares `commissionMethod: CommissionMethodId` in `SampleFeesCardProps` but the component destructures only `{ symbol }`. Per design-visual.md §6 the Jupiter-method feature gate lives in the parent (BacktestPanel renders it only for jupiter_ultra/jupiter_manual), so the prop is contract-only today. Either drop it from the props interface (if the parent gate is permanent), or document why it exists (future in-card gating).

## Rationale
An unused required prop is a small API-surface smell — a consumer could reasonably think the card gates itself.

## Evidence
SampleFeesCard.tsx:44-49 — props interface declares commissionMethod; function destructures `{ symbol }` only.

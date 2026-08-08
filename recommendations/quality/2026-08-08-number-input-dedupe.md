# Dedupe callers onto shadcn NumberInput
**Date:** 2026-08-08
**Source:** Frontend Engineer — lane 1b (overlays conversion)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
`NumberInput.tsx` (shadcn Input + stepper Buttons) is currently orphaned — `BacktestGeneralSettings.tsx` hand-rolls its own steppers. Dedupe callers onto NumberInput.

## Rationale
Single source of truth for numeric steppers (UX §2.2: 44px, ArrowUp/Down, min/max clamp). Reduces bespoke code, keeps behavior consistent.

## Evidence
- Lane 1b handoff: "NumberInput is currently orphaned (BacktestGeneralSettings hand-rolls its own steppers)"
- Files: frontend/src/components/NumberInput.tsx, BacktestGeneralSettings.tsx

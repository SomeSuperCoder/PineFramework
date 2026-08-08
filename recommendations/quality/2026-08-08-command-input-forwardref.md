# ui/command.tsx CommandInput should forwardRef
**Date:** 2026-08-08
**Source:** Test Engineer — suite run (shadcn conversion wave)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
`frontend/src/components/ui/command.tsx` — `CommandInput` is not forwardRef'd → React ref warning; QuickAdderPopup auto-focus works only by luck of Radix FocusScope. Make CommandInput forward its ref to the underlying cmdk input.

## Rationale
Clean ref contract; avoids fragile auto-focus behavior in Command consumers (QuickAdderPopup, StrategySelector).

## Evidence
- TE handoff: "ui/command.tsx CommandInput not forwardRef'd → React warning + QuickAdder auto-focus works by luck of FocusScope"

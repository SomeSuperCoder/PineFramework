# In-frame segmented panel switcher
**Date:** 2026-08-08
**Source:** Frontend Engineer — lane 2 (chrome conversion workup)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Objective
Decide whether the app frame requires a visual pill segmented switcher row (1–5 panels) IN ADDITION to the Sidebar rail. Lane 2 styled the Sidebar rail per §15.5/pill and did NOT invent a second switcher in the frame (would break layout/tests).

## Rationale
DESIGN.md §15.5 describes a pill segmented control; the frame already has the Sidebar + keyboard 1–5. An additional in-frame selector would be a NEW component (layout/behavior change) — needs a design decision before building.

## Evidence
- Lane 2 open item #2: "No in-frame panel switcher existed… if the design calls for a pill segmented switcher row IN the frame in addition to the sidebar, that's a new component microtask."
- Files: frontend/src/components/ControlPanel.tsx, Sidebar.tsx

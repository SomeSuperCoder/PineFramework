# Pre-existing keyboard gaps surfaced during motion audit (report-only)
**Date:** 2026-08-13
**Source:** team/frontend/ux-designer (a11y audit, animations-v1)
**Priority:** low
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Two keyboard-accessibility gaps observed in scoped files — both PRE-EXISTING (not introduced by the M1/M2/M3 motion pass). Owned by the frontend engineer / QA, not the motion pass:

1. **BacktestPanel wizard StepDot** (`frontend/src/components/BacktestPanel.tsx`, ~line 60): `StepDot` renders a clickable `<span onClick={done ? () => setStep(s) : undefined}>` — not a `<button>`, no `role`, no `tabIndex`, no Enter/Space handler. Users who navigate by keyboard cannot click a completed step to jump back to it (mouse users can). Fix: render as `<button type="button">` (or add `role="button" tabIndex={0}` + keydown handler) when `done` is true.

2. **ControlPanel sidebar hover-expand** (`frontend/src/components/ControlPanel.tsx`, `handleSidebarHover` → `Sidebar`): the sidebar expands on hover. `Sidebar` itself was NOT in the audit's scoped read list, so keyboard parity could not be verified. If the sidebar has no focus/click mechanism to expand (or collapses when focus leaves), keyboard users lose access to collapsed navigation. Verify and, if missing, add a focus-in/click expansion equivalent.

## Rationale
These are WCAG 2.1.1 (Keyboard) items adjacent to the motion audit's checklist item 7 (hover-dependent UI / keyboard access). They are NOT regressions from the motion pass — the motion pass added only decorative animation, no new hover-dependent behavior.

## Evidence
- `frontend/src/components/BacktestPanel.tsx` — `StepDot` span with `onClick`, no keyboard affordance.
- `frontend/src/components/ControlPanel.tsx` — sidebar expands via `onHoverChange`; keyboard parity unverified (Sidebar out of scope).

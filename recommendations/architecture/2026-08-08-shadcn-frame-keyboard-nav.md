# Sidebar rail keyboard navigation (ArrowLeft/Right/Escape)
**Date:** 2026-08-08
**Source:** Frontend Engineer — lane 2 (chrome conversion work report)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
The app's sidebar rail (64↔220 expand) has NO keyboard navigation today (no ArrowLeft/Right/Escape handlers in the frame — they only exist inside popups). DESIGN.md §16 chrome dictates imply keyboard rail navigation.

## Rationale
The rail is a primary navigation surface; keyboard escape/arrow navigation is expected by the accessibility law (keyboard nav in UX §2.2.5). Without it, the chrome is incomplete vs the design spec.

## Evidence
- Lane 2 handoff: "No ArrowLeft/Right/Escape keyboard behavior exists in Sidebar/ControlPanel today — only popups have Arrow/Escape handlers."
- Files: frontend/src/components/Sidebar.tsx, ControlPanel.tsx

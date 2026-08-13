# Sidebar Overlay Expand

## Problem Statement

The global sidebar sits as a flex sibling next to the content area. When hovered it expands 64px → 220px, and because it is in normal flow it **shrinks the active panel**. On the dashboard, that resize resizes the canvas chart container → the chart re-renders → a visible **flash** every time the sidebar is hovered. Annoying on a trading dashboard where the chart is the primary surface.

## Proposed Change

Change the sidebar hover-expand from **push** (resizes sibling content) to **overlay** (floats over the content):

1. **Sidebar becomes absolutely positioned** within the content row, still animating width 64 ↔ 220px on hover, with a z-index **above** the panel content but **below** the modal layer (dialogs/popovers are `z-50` — sidebar uses `z-40`).
2. **Content area gets a fixed 64px left offset** (the collapsed rail width) so content never sits under the collapsed rail — it always starts at x=64 regardless of hover state.
3. **No scrim/dim** over the panel — the sidebar reads as "on top" via its own background + a subtle edge shadow/border. The chart stays fully visible while navigating.
4. **Behavior preserved:** same 220px expanded width, 200ms width transition, hover trigger (mouse-enter expand / mouse-leave collapse), keyboard shortcuts 1-4, same nav items and active indicator.

## Non-goals

- No change to the motion system, tokens, or chart code
- No redesign of sidebar content, colors, or nav items
- No scrim/backdrop — the panel stays visible under the flyout
- No change to modal z-index ordering
- No change to the TopBar (sidebar stays within the row below it, as today)

## Affected Capabilities

- `frontend-application` — application shell / navigation layout

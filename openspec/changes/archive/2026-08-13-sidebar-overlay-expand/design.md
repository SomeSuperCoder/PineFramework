# Design — Sidebar Overlay Expand

## Decisions

### D1. Overlay, not push — absolute positioning in the content row
Today `ControlPanel.tsx:71-92` renders a flex row with `<Sidebar>` (flex `shrink-0`, in-flow) + `<ContentArea>` (flex `flex-1`). Expanding the sidebar in-flow shrinks ContentArea → chart container resize → canvas flash.

Fix: the row container gets `relative`; `<Sidebar>` becomes `absolute inset-y-0 left-0 z-40`; `<ContentArea>` gets a fixed left margin equal to the collapsed rail width (`ml-16` = 4rem = 64px). The sidebar animates width 64 ↔ 220 over the content; ContentArea width never changes → chart container never resizes → no flash.

### D2. Z-index layering
- Sidebar: `z-40` — above all panel content (no z-index), below radix overlays (`z-50`, verified in ui/dialog.tsx etc.).
- No scrim. Separation is achieved by the sidebar's own `bg-card` + `border-r` + a subtle right-edge shadow (`shadow-xl` is too heavy; use `shadow-lg` or a soft ring) so it reads as a flyout above the panel.

### D3. Content offset is constant — `ml-16` (64px)
The offset must match the collapsed rail width (4rem). Content starts at x=64 in BOTH states. When the sidebar expands to 220px it covers x=64..220 of the content — the flyout region — leaving the rest (chart) untouched. The collapsed rail is `overflow-hidden`; only icons show, exactly as today.

### D4. Behavior identical to today
- Width transition stays inline on the `<nav>`: `transition: width 200ms cubic-bezier(0.25, 0.1, 0.25, 1)` (reduced-motion global guard already zeroes it).
- Hover state stays in ControlPanel (`sidebarExpanded` + `onHoverChange`), unchanged.
- `aria-expanded` on the nav unchanged.
- Pointer events: while hovered, the flyout region belongs to the sidebar (chart under it does not receive hover) — inherent to overlaying, accepted.

## Edge cases

- **Breadcrumb bar:** ContentArea's breadcrumb sits inside ContentArea (starts at x=64) — the flyout covers its left edge while open. Acceptable (transient, hover-only, same as any flyout).
- **Keyboard navigation:** Tab order unaffected — the nav is still in DOM order before ContentArea.
- **Reduced motion:** global guard zeroes the width transition → the sidebar snaps open/closed instantly (same as today's reduced-motion behavior).
- **Small screens:** absolute overlay works at any width; no new responsive breakpoints introduced.

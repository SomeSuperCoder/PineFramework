## Purpose

Defines the shadcn/ui component layer that carries the DESIGN.md UX contract — Radix-backed, keyboard-accessible, reduced-motion-aware primitives whose every visual value resolves from the PineFramework `--pf-*` token bridge. This is the implementation vehicle for the DESIGN.md component recipes.

## ADDED Requirements

### Requirement: shadcn primitives resolve from pf tokens
The frontend SHALL provide a shadcn/ui component layer (Tailwind v4 + Radix-backed primitives: Button, Badge, Card, Input, Textarea, Label, Select, Tabs, Dialog, AlertDialog, Popover, Command, DropdownMenu, Switch, Tooltip, Skeleton, Alert, Progress, Table). Every shadcn theme variable (--background, --foreground, --card, --primary, --secondary, --muted, --accent, --destructive, --border, --input, --ring, --radius, --font-sans) SHALL be a CSS alias of a `--pf-*` token (e.g. `--background: var(--pf-canvas)`), never a duplicate literal color. Any literal color value in the shadcn alias block SHALL fail conformance.

#### Scenario: Shadcn vars alias pf tokens
- **WHEN** the shadcn bridge stylesheet is linted for literal hex/oklch values in the aliased theme variables
- **THEN** each shadcn variable SHALL reference `var(--pf-*)`
- **AND** no literal color value SHALL appear in the theme-variable declarations

#### Scenario: Primary button is the white pill
- **WHEN** the shadcn Button default variant renders
- **THEN** its background SHALL be the DESIGN.md §15.1 primary value (`--pf-ink-1` white pill) with dark ink foreground — NOT the brand-yellow accent
- **AND** the yellow pill SHALL exist only as a separate accent variant (≤ 1 per viewport)

### Requirement: Radix UX contract is carried by default
The shadcn component layer SHALL provide the DESIGN.md Part-B UX behavior by construction: Dialog/AlertDialog focus trap + Escape close + focus restore + `aria-modal`, Tabs roving tabindex + arrow keys + `aria-selected`, Select keyboard operable, Tooltip keyboard accessible, Switch `role="switch"`. No bespoke re-implementation of these behaviors SHALL be needed at call sites (they must come from the layer).

#### Scenario: Modal focus trap and restore
- **WHEN** the user opens a shadcn Dialog containing focusable elements and presses Tab/Shift+Tab repeatedly, then Escape
- **THEN** focus is trapped inside the dialog while open
- **AND** on Escape, the dialog closes and focus is restored to the trigger element

#### Scenario: Tabs are arrow-navigable
- **WHEN** the user focuses a shadcn Tabs tab and presses ArrowLeft/ArrowRight/Home/End
- **THEN** selection moves by roving tabindex
- **AND** `aria-selected` reflects the active tab

### Requirement: Motion is DESIGN.md motion
The shadcn layer SHALL override default shadcn animation durations/easings to the DESIGN.md §13 tokens (motion-fast 150ms, motion-base 200ms, ease `cubic-bezier(0.25,0.1,0.25,1)`) and SHALL respect `prefers-reduced-motion` globally (transitions/animations collapse to 0.01ms per the DESIGN.md §13 block).

#### Scenario: Modal enter uses pf motion
- **WHEN** a shadcn Dialog opens
- **THEN** its enter animation SHALL use the DESIGN.md base motion duration (200ms, ease-out)
- **AND** no shadcn default animation (e.g. 300ms zoom/spring) SHALL remain in the layer

#### Scenario: Reduced motion collapses all animation
- **WHEN** the OS has reduced-motion enabled and any shadcn component animates (modal, tab, popover, skeleton)
- **THEN** animation and transition durations SHALL collapse per the DESIGN.md §13 kill-switch

### Requirement: Bespoke app layer stays app-specific
Elements without a shadcn equivalent SHALL remain bespoke but shall consume the pf tokens and shadcn/theme styling where possible: StatusDot (pulse gated by reduced motion, `aria-label` + live region), panel keyboard routing 1–5 (ControlPanel), ErrorConsole (`aria-live="polite"`, roles per severity), canvas chart engine (`frontend/src/chart/**` — never converted to DOM components).

#### Scenario: StatusDot pulse disabled under reduced motion
- **WHEN** the OS has reduced-motion enabled and a live StatusDot renders
- **THEN** the pulse animation SHALL NOT run (static color)
- **AND** the state SHALL be conveyed by text (`aria-label`) rather than glow alone

### Requirement: Weight cap and pill-law enforced on the layer
The shadcn layer SHALL never exceed font-weight 600 in its recipes or its caller-markup (no `font-bold`/700+), SHALL apply full-pill radius (`--pf-radius-full` = 9999px) to every Button/tab/badge/status-dot per DESIGN.md §10, and SHALL use 44px (compact 40px) minimum button/icon-button heights per §15.1.

#### Scenario: Weight cap conformance
- **WHEN** a conformance scan checks the ui/ components and converted page components
- **THEN** no style rule or class SHALL declare a font weight greater than 600

### Requirement: shadcn adoption is Rollback-safe
The migration SHALL proceed in additive waves: each wave SHALL keep the token-mirror test green, keep the app buildable, and preserve the chart `window.__pineChart` bridge + canvas element counts. Removal of legacy bespoke primitives happens only after their shadcn replacements pass tests.

#### Scenario: Each wave keeps the app green
- **WHEN** a wave of the migration completes
- **THEN** `pnpm build` and the unit test suite SHALL pass
- **AND** the `token-mirror` test SHALL still pass
- **AND** chart canvas counts and the `window.__pineChart` bridge SHALL be unchanged

#### Scenario: Legacy primitive removed only after replacement passes
- **WHEN** a bespoke primitive (e.g. hands-rolled combobox, bespoke modal) has a shadcn replacement in place
- **THEN** the replacement's tests SHALL pass before the bespoke code is deleted
- **AND** the deletion SHALL be revertible at the per-component boundary

## MODIFIED Requirements

### Requirement: Single design token source
The frontend SHALL maintain a single, typed design token source (`frontend/src/theme/tokens.ts`) containing all colors, radii, spacing, elevations, motion durations, and typography values of the Miro-dark system. The global CSS SHALL mirror those tokens via CSS variables. **tf/shadcn theme variables SHALL be derived aliases (`var(--pf-*)` references) in the bridge stylesheet, never literal values, so the token source remains the sole authority.**

#### Scenario: CSS mirrors TS tokens
- **WHEN** the mirror-consistency test runs
- **THEN** every token in `:root` SHALL equal the corresponding value in `tokens.ts`
- **AND** the test SHALL fail (RED) when they diverge

#### Scenario: Shadcn aliases carry no literals
- **WHEN** a linting pass scans the shadcn theme bridge (e.g. `frontend/src/shadcn.css` or the `@theme inline`-equivalent in index.css)
- **THEN** every shadcn CSS variable declaration SHALL be a `var(--pf-...)` reference
- **AND** no hex/oklch literal SHALL appear outside the mirror-consistent `:root` token block

## REMOVED Requirements

### Requirement: React Frontend Application provides a shared primitive layer consuming tokens
**Reason**: Replaced by the shadcn component layer (this change's new `shadcn-component-layer` capability) — the “shared primitive component” is now the shadcn set with a thin recipe layer; the requirement is absorbed into that capability.
**Migration**: `frontend-application` no longer mandates bespoke primitives; the `shadcn-component-layer` capability now covers primitive usage. The token-source and no-legacy-hex constraints remain in `frontend-application` (kept in its delta).
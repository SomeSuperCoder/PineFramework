## Why

The frontend is a fully bespoke React/TypeScript UI: every component is styled with inline `style={{...tokens}}` objects, with hand-rolled popups, comboboxes, tabs, and modals that only partially implement the DESIGN.md UX contract (focus traps, roving tabindex, aria-modal, focus restore, 7-state buttons/inputs). The Director's directive: *"Update/rework the entire frontend UI/UX to utilize shadcn/ui to its maximum yet maintaining the guidelines of DESIGN.md."* shadcn/ui provides battle-tested, Radix-backed, keyboard-accessible components that satisfy the DESIGN.md UX contract by construction — while DESIGN.md remains the immutable token source of truth.

## What Changes

- **BREAKING** — Add the Tailwind CSS v4 pipeline (`@tailwindcss/vite`) to the frontend and adopt shadcn/ui components (from the official registry) as the component layer.
- **BREAKING** — Replace bespoke popups/modals/comboboxes/tabs/selects with the shadcn component set (Dialog, AlertDialog, Popover, Command, Tabs, Select, DropdownMenu, Button, Input, Switch, Tooltip, Skeleton, Badge, Alert, Progress, Table) — while keeping app-specific shell (TopBar/Sidebar/ControlPanel) layout and the canvas chart engine untouched.
- **Tokens** — Keep `--pf-*` CSS variables and `theme/tokens.ts` as the SINGLE source of truth (token-mirror test stays green). A bridge file maps shadcn theme variables to `--pf-*` via `@theme inline` aliases — no duplicated literal color values, DESIGN.md wins.
- **Design-law enforcement** — Pill-radius buttons, ≤600 weights, dark-only (no light theme file), focus ring from DESIGN.md §12, motion tokens §13, inverse-white primary button (per §15.1) with yellow as accent-only.
- **Accessibility contract** — Radix provides focus traps, roving tabs, aria-modal, focus restore. Bespoke app layers on top: StatusDot pulse gated by `prefers-reduced-motion`, panel routing 1–5 kept in ControlPanel, ErrorConsole `aria-live` regions, 7-state buttons/inputs.
- **Charts untouched** — `frontend/src/chart/**` canvas engine and wrapper chart components keep their props contracts and `window.__pineChart` bridge (e2e asserts canvas counts).
- **Test migration** — Tests asserting legacy classes (`quick-adder-*`), style-based locators, and pixel goldens are migrated (Test Engineer) or re-baselined; token-mirror test extended/scoped if needed; new shadcn components get coverage.

## Capabilities

### New Capabilities
- `shadcn-component-layer`: The frontend SHALL provide a shadcn/ui primitive layer (Tailwind v4 + Radix-backed) that carries the DESIGN.md UX contract — focus trapping, roving tabindex, aria-modal, focus restore, keyboard operability, reduced-motion — while every visual value resolves from the `--pf-*` token bridge.

### Modified Capabilities
- `design-system`: FriSINGE token mirror contract extended — shadcn theme variables SHALL be CSS embedded aliases of `--pf-*` (never literals); pill/weight/dark-only/ring recipes enforced through shadcn component styling.
- `frontend-application`: The shared primitive layer is now the shadcn set; the ad-hoc inline `tokens`-style duplication is replaced by shadcn components + a narrow recipe layer; chart engine and panel layout semantics unchanged.
- `dark-theme`: Dark-only must survive the shadcn adoption (no shadcn `light` theme, no `prefers-color-scheme: light` anywhere, native chrome dark).

## Impact

- **Code**: `frontend/src/components/ui/**` (new shadcn layer), all component files in `frontend/src/components/**` (swap to UI layer), `frontend/src/index.css` (add bridge/`@theme inline` block — `:root` token block untouched), `frontend/vite.config.ts` + `frontend/vitest.config.ts` (Tailwind plugin + `@/` alias), `frontend/package.json` (new deps), tsconfigs (`@/` path).
- **Tests**: `token-mirror.test.ts` (stays green; scoped if needed), `QuickAdderPopup.test.tsx`, `backtest-flow.test.tsx`, `CodeEditor.test.tsx`, `trade-dashboard.test.tsx` + e2e `trade-dashboard.spec.ts`, `chunk-boundary.spec.ts` (keeps canvas + bridge), `chunk-border-visual-regression.spec.ts` (re-baseline/re-track via goldens).
- **Chart**: `frontend/src/chart/**` — NOT touched; wrapper components keep contracts; canvas count + `__pineChart` bridge stable.
- **Not**: backend, pine-framework core engine, data/state hooks.

## Non-goals

- No React 19 upgrade (stay React 18).
- No rework of the canvas chart engine or chart renderers.
- No rework of backend/logic/state flows — UI presentation layer only where state/params plumbing stays identical.
- No new design language — DESIGN.md Miro-Dark IS the law; shadcn layout is the vehicle.
- No light theme — ever.
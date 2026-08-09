## Context

See proposal.md. Current frontend is React 18 + Vite 5 + TS; every component styles via inline `style={{...tokens}}` reading `frontend/src/theme/tokens.ts` (a runtime object + flat `cssVars` map), byte-mirrored to `index.css` `:root` `--pf-*` custom properties (enforced by `token-mirror.test.ts`). No Tailwind, no shadcn, no Radix installed. Components such as StrategySelector, QuickAdderPopup, GoToDatePopup, CodeEditor overlay, StrategyConflictDialog are bespoke with partial a11y. The chart engine (`frontend/src/chart/**`, canvas) and its wrappers (`ChartComponent`, `MiniChart`) have stable props + a `window.__pineChart` bridge asserted by e2e. DESIGN.md §15.1 defines the primary Button as the inverted WHITE pill (`--pf-ink-1` bg, ink fg); §7 reserves brand-yellow as an accent pill ≤1/viewport. DESIGN.md §0 is dark-only, forever.

The architecture direction (per Wise Old Man + Frontend Lead consultation, both advisory) is: Tailwind v4 + `@tailwindcss/vite` + shadcn CLI on React 18, keeping `--pf-*` as the single literal source and deriving every shadcn theme variable from it via `@theme inline` CSS aliases.

## Goals / Non-Goals

**Goals:**
- Introduce Tailwind v4 via the Vite plugin and a `@/` path alias; run shadcn init & add the component set into `frontend/src/components/ui/`.
- Keep `tokens.ts` + `index.css` `:root` untouched (byte-mirror green) and build the shadcn theme bridge as derived aliases (`var(--pf-*)`) in a new stylesheet block/file.
- Convert the bespoke component surfaces to the shadcn layer: primitives (Button, Input, Badge, Tabs, Dialog, AlertDialog/Popover/Command for overlays, Select, Switch, Progress, Skeleton, Card, Alert, Tooltip, Table), then chrome (TopBar, Sidebar, ControlPanel, AppToolbar, ContentArea), then panels/views (Backtest, Results, Strategy, Trades, Stats, Errors, Telegram, Settings, Live).
- Preserve chart contracts, the app 1–5 panel routing, the DESIGN.md UX contract (focus traps, roving tabs, aria-modal, focus restore, reduced motion, 7-state controls), and all design law (dark-only, pill buttons, ≤600 weights, white-primary/yellow-accent, focus ring, tabular-nums).

**Non-Goals:**
- No React 19 upgrade; no rework of chart engine internals; no backend/data-flow changes; no new visual language; no light theme.

## Decisions

### D1 · Tailwind v4 + @tailwindcss/vite (no v3, no shadcn-without-tailwind)
Adopt Tailwind v4 CSS-first with the official Vite plugin. Rationale: shadcn's current registry emits v4-style components; `@theme inline` consumes our existing CSS custom props by reference (no duplicate literals); v3's JS-config era means a second migration later. Alternatives: v3 + tailwind.config bridge (rejected — adds a config system we'll abandon), shadcn-without-Tailwind (rejected — fragments “to its maximum”; the components ARE Tailwind classes). Vite stays 5.x (bump ≥5.2 for the plugin).

### D2 · Token bridge: `--pf-*` stays the source; shadcn vars are CSS aliases only (never literals)
- Add to a NEW `frontend/src/shadcn.css` (imported after index.css; `:root` in index.css untouched) + `@theme inline` mapping: `--background→var(--pf-canvas)`, `--foreground→var(--pf-ink-1)`, `--card→var(--pf-surface-1)`, `--card-foreground→var(--pf-ink-1)`, `--popover→var(--pf-surface-2)`, `--primary→var(--pf-ink-1)` (**NOT yellow** — D3), `--primary-foreground→var(--pf-ink)`, `--secondary→var(--pf-surface-2)`, `--secondary-foreground→var(--pf-ink-1)`, `--muted→var(--pf-surface-2)`, `--muted-foreground→var(--pf-steel-muted)`, `--accent→var(--pf-brand-blue)`, `--accent-foreground→var(--pf-ink-1)`, `--destructive→var(--pf-semantic-error)`, `--destructive-foreground→var(--pf-ink-1)`, `--border→var(--pf-hairline)`, `--input→var(--pf-hairline-strong)`, `--ring→var(--pf-brand-blue)`, `--radius→var(--pf-radius-md)`, `--font-sans→var(--pf-font-family)`.
- `@theme inline` is mandatory so utilities resolve to `var(--background)` → `var(--pf-*)` at runtime (theme hot-swap from tokens.ts).
- **Conformance guard**: extend `token-mirror.test.ts` (or add a sibling test) to assert (a) each shadcn var in `shadcn.css` is a `var(--pf-...)` reference, (b) no literal hex/oklch appears in the shadcn block — this is the anti-drift tripwire. If token-mirror does bidirectional equality, scope it to `--pf-*` keys (it is believed one-directional; build will confirm).

### D3 · DESIGN.md §15.1 arbitration — primary = inverted white pill, NOT yellow
- shadcn `default` Button variant background → `--pf-ink-1` (white) with `--pf-ink` text. This is DESIGN §15.1's dominant CTA. Brand-yellow becomes the `accent` variant (≤1 per viewport). Blue stays `--ring`/focus and `accent` color (actions/focus, not fills). This resolves the advisory's mapping conflict with DESIGN.md. (Wise Old opinion had `--primary=yellow`; Frontend Lead's reading §15.1 is LAW-correct; I hold DESIGN.md wins.)

### D4 · shadcn component mapping
| Current bespoke | shadcn replacement |
|---|---|
| Inline `<button style>` everywhere | `Button` (variants: default=white pill, secondary, outline, ghost, accent-yellow, destructive) + `IconButton` (44px, `rounded-full`, ghost) |
| `QuickAdderPopup` | `Command` (cmdk) inside `Popover` — search + arrow-nav + scrollIntoView semantics |
| `GoToDatePopup` | `Popover` + `Input` + calendar/`Input` |
| `CodeEditor` overlay shell | `Dialog` (large) — editor core stays |
| `StrategyConflictDialog`, `StrategyResultsPopup` | `Dialog` / `AlertDialog` (destructive confirm → AlertDialog; info/results → Dialog) |
| LiveDashboard in-panel tabs, BotControls run-mode | `Tabs` (roving tabindex) + `Switch` for toggle pills |
| SettingsPanel `Select`/`Toggle`/`NumberInput` | `Select`, `Switch`, `Input`+steppers (numeric logic survives via `NumberInput` recipes) |
| `ProgressBar` | `Progress` (Radix; determinate/indeterminate; variants per §15.7) |
| `Badge`/`Tag` | `Badge` variants §15.8 (yellow/blue/success/error/neutral) + `Tag` recipe |
| `StatusDot` | bespoke (pulse gated `motion-reduce:`) — no Radix equivalent; restyled via tokens |
| `TopBar`, `Sidebar`, `ControlPanel`, `ContentArea`, `AppToolbar`, panels | bespoke shell layout, inner primitives via shadcn |
| Chart chrome | bespoke chrome/overlays (canvas untouched) |

### D5 · React 18 pinned, no React 19
shadcn's latest still supports React 18 via peer deps; when running `shadcn init`, decline the React 19 upgrade. Pin `@radix-ui/*` versions with `^18` peers. No React-19-only components (useActionState-based forms).

### D6 · Motion, dark-only, weights — global layers in shadcn.css
- Override shadcn `--animate-in/out`, zoom/accordion durations to `var(--pf-motion-*)` (150/200ms ease) + `@media (prefers-reduced-motion: reduce)` kill-switch (already in index.css §13 — keep, ensure shadcn.css does not re-enable).
- One dark-only block. No `light` theme file generated, no `prefers-color-scheme: light`, no `dark:` class toggling.
- Weight cap ≤600: replace any `font-bold` in ui/ with 600-compatible utilities (`font-semibold`); add a lint/test tripwire scanning ui + converted pages for 700+.
- Focus ring: set ring width 2px + offset to mirror `--pf-focus-ring` (§12) on shadcn focus-visible.

## Risks / Trade-offs
- ⚠️ **token-mirror.test.ts byte-equality** → Bridge lives in a separate `shadcn.css`; `index.css` `:root` untouched; guard test scoped to `--pf-*`; conformance test for "no literals in shadcn block" added. Gate stays green EVERY wave.
- ⚠️ **Tailwind v4 + Vite 5 + vitest CSS processing** → A1 owns vite/vitest css config; add `@tailwindcss/vite` + a minimal `main.css` import; verify vitest compiles the CSS before any component conversion. Fallback: configure css in vitest via vite plugin settings.
- ⚠️ **e2e selector/class coupling** (`trade-dashboard.spec.ts` style locator, `quick-adder-*` classes, `chunk-border-visual-regression.spec.ts` goldens, canvas count) → per-component test migration + e2e re-baseline in E; keep copy text exact; quarantine pixel golden until E-wave; keep `window.__pineChart` + canvas count.
- ⚠️ **Radix portal/class changes** → portaled components always updated in lockstep with their widget; Playwright flow per swap; never commit a partially-converted surface.
- ⚠️ **Bundle size** → code-split panels already; review at E-wave.
- ⚠️ **Preflight reset** (Tailwind v4 base) shifts rien for inline-token components; verify visuals via screenshot pass at each wave close.

## Migration Plan
1. **W1 — Foundation (A1–A4)**: bump Vite ≥5.2; add Tailwind v4 + `@tailwindcss/vite` + `cva`/`clsx`/`tailwind-merge`/`lucide-react`/`@radix-ui/*`; `shadcn init` (decline React 19) → adds `@/` alias (tsconfig + vite resolve); create `ui/` + `lib/utils.ts` (cn); write `shadcn.css` bridge + `@theme inline`; extend token-mirror + add conformance test; import CSS in main; **exit gate: `pnpm build` + `pnpm test` + app renders (Playwright smoke) with zero token mirror drift, zero visual difference (screenshot pass)**.
2. **W2 · Primitives (B1–B7)**: add each shadcn component via `shadcn add`; swap primitive surfaces (buttons, inputs, selects, dialogs, popovers, command, tabs, switch, progress, badge, skeleton, alert, tooltip, table); per-swap test migration; 3 parallel lanes by group; **exit: all ui-using tests green + Playwright smoke**.
3. **W3 · Chrome (C1–C4)**: TopBar, Sidebar (click-expand + aria), ControlPanel (segment + 1–5 + role=region), ContentArea, AppToolbar → shadcn inner primitives; keep layout/keys.
4. **W4 · Panels (D1–D6, parallel lanes)**: Backtest cluster, Strategy cluster, Live cluster, Data/Tables, Telegram/Settings/Errors, Chart chrome. Keep state logic; panels via shadcn cards/tabs/tables/inputs; ErrorConsole/StatusDot bespoke restyle + a11y.
5. **W5 · Verify (E1–E3)**: Test Engineer migrates problematic tests; e2e regen + goldens; QA + a11y + contrast + motion audit (UX).
6. **W6 · Code review + legacy sweep (E4/E5)**: scan for raw hex left, dead CSS, weight > 600; final QA GO; commit.

Rollback: W1 reversible (remove plugin + bridge + deps) — original state restores. W2+ per-swap revertible at component granularity; no giant single change.

## Open Questions
- None that change the specs/approach. (Proposed on-contract: shadcn init version pin behavior, e2e goldens re-baseline timing — handled inside tasks, not blocking decisions.)
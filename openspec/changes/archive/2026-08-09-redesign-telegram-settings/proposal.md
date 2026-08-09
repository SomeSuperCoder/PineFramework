## Why

The Telegram settings screen (`TelegramConfigPanel.tsx`) is the most unstructured surface in the app: 8 flat sections of bare `div`s, ~40 inline styles, mixed control heights, raw HTML checkboxes, emoji icons, plain-text loading/status, and zero test coverage. It does not look professional and does not match the shadcn/Card-based design system established in the prior frontend rework.

## What Changes

- Restructure the panel into **Card-based sections** (`Card`/`CardHeader`/`CardTitle`/`CardContent`), grouping the 8 flat sections into logical groups: *Connection* (Bot Token + HTTP Proxy), *Diagnostics* (Send Test), *Access Control* (Admin + Controller Requests + Controllers), *Recipients* (Chats + Per-Alert toggles).
- Replace all raw/inline styling with shadcn primitives + Tailwind theme tokens: one consistent control height, `Switch`/`Select`/`Input`/`Label` everywhere, lucide icons (no emoji), `Alert` for status, `Skeleton` for loading, `AlertDialog` for destructive remove.
- Bound the unbounded lists: Chats list and Per-Alert grid get ScrollArea/collapsible treatment so they cannot explode vertically.
- Extract the 14 raw `fetch` helpers into a testable API module/hook; decompose the 719-line file into a `TelegramConfigPanel/` folder with sub-components, each < 500 lines.
- Add test coverage (component has zero today): render, token masking, switch toggle + optimistic rollback, AlertDialog confirm, empty states.
- Remove dead state (`setProxy` value never read), keep `type="password"` masking for the bot token, preserve the `TelegramConfigPanel` export and `alertConditions`/`onClose` contract (App.tsx:581 unchanged).

**Non-goals:** No backend/API changes. No i18n extraction (no i18n infra exists). No new design tokens (consume existing system). No modal conversion (stays a full-area panel). No visual world replacement (Card-based *within* the existing oklch/shadcn system).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none — presentation-only refactor; `skip_specs: true` set in `.openspec.yaml`. No spec-level behavior changes: same API calls, same config surface, same interactions.)

## Impact

- **Code:** `frontend/src/components/TelegramConfigPanel.tsx` → decomposed into `frontend/src/components/TelegramConfigPanel/` (index.tsx + shared sub-components + API hook). `App.tsx:581` import site unchanged.
- **API:** none (same `/api/settings/telegram*` endpoints).
- **Dependencies:** none new (lucide-react already used by select.tsx).
- **Tests:** new component tests in `frontend/src/__tests__/`; one Playwright flow optional (network-mocked).

# Design — Telegram Settings Screen Redesign

## Context

`TelegramConfigPanel.tsx` (719 lines, one component) renders 8 flat sections (Bot Token, Send Test, HTTP Proxy, Admin, Controller Requests, Controllers, Chats, Per-Alert toggles) as bare `mb-4` divs with ~40 inline `tokens.colors.*` styles, mixed control heights (h-9/h-10/h-11), emoji icons, plain-text loading, raw HTML checkboxes, and zero tests. Mounted full-area in `App.tsx:581` (`activePanel === 'telegram'`), props `{ alertConditions, onClose }`.

Target family (Director decision): **Card-based**, consistent with the prior "proper Card-based layouts" rework. Inherit SettingsPanel conventions (tokens-panel wrapper, fontSize 13, radius 8, padding 20, SectionHeader/SettingRow hairline recipes) for cross-panel cohesion.

## Architecture

```
frontend/src/components/TelegramConfigPanel/
├── index.tsx                 # wrapper: export TelegramConfigPanel (keeps App.tsx:581 contract)
├── telegramApi.ts            # 14 fetch helpers extracted → testable mock boundary
├── useTelegramPanelState.ts  # 19 useState vars + handlers (optional, if size demands)
├── SectionHeader.tsx         # shared section header (border-b, icon, label)
├── SettingRow.tsx            # label-left + control-right hairline row
├── StatusCallout.tsx         # role=status/alert success/error callout
├── cards/
│   ├── ConnectionCard.tsx    # Bot Token + HTTP Proxy
│   ├── DiagnosticsCard.tsx   # Send Test
│   ├── AccessControlCard.tsx # Admin + Controller Requests + Controllers
│   └── RecipientsCard.tsx    # Chats + Per-Alert toggles
```

Every file < 500 lines. `index.tsx` keeps the `TelegramConfigPanel` export name and the same props interface.

## Card grouping (Information Architecture)

| Card | Sections | Controls |
|------|----------|----------|
| Connection | Bot Token, HTTP Proxy | Input(password)+Eye/EyeOff, Input host/port/user/pass, Save |
| Diagnostics | Send Test | Button + status Alert |
| Access Control | Admin, Controller Requests, Controllers | Inputs, Set Admin, Approve/Deny, Remove (AlertDialog confirm) |
| Recipients | Chats, Per-Alert toggles | Link/Unlink, Language Select, member Switch, per-alert Switch grid |

## Styling rules

- Root wrapper: `flex flex-1 flex-col overflow-auto rounded-md border border-border bg-card p-5 text-foreground` (BacktestPanel recipe) — **not** inline styles.
- Cards: `Card` + `CardHeader`/`CardTitle` + `CardContent`; group with `flex flex-col gap-4`.
- Controls: one consistent height — `h-10` for inputs/buttons (or the size="default" h-11 Button) across ALL sections; no mixing.
- Icons: lucide-react (Eye, EyeOff, Send, Shield, Users, MessageSquare, Trash2, etc.) — no emoji.
- Status: `Alert` (variant default/destructive) with `role="status"`/`role="alert"` — no inline text divs.
- Loading: `Skeleton` for initial load; no layout shift (reserve card heights).
- Busy: Button `disabled` + subtle spinner (or `aria-busy`), not literal `'...'`.
- Destructive remove: `AlertDialog` confirm.
- Per-member notification checkboxes → real `Switch` (enabled or disabled state, labeled with `Label`).
- Purge remaining `style={{ color: tokens.colors.* }}` → tailwind tokens (`text-muted-foreground`, `text-destructive`, etc.).

## Bounded lists (anti-N×M)

- Chats: max-height `ScrollArea` with cap; empty state.
- Per-Alert grid: per-alert `Collapsible`/`ScrollArea` so alerts × chats cannot explode the panel; keep toggle state updates localized (one switch flip must not re-render the whole panel).

## API layer

`telegramApi.ts` exports typed functions: `fetchTelegramConfig`, `saveBotToken`, `sendTestMessage`, `fetchAlertPreference`, `setAlertPreference`, `fetchProxyConfig`, `saveProxyConfig`, `setAdmin`, `approveControlRequest`, `denyControlRequest`, `removeController`, `updateChatLanguage`, `linkChat`, `unlinkChat`. Add error propagation (no silent catch/ignore). Keep endpoints identical.

## Token security

Bot token stays `type="password"`; Eye/EyeOff reveal only on explicit click; value never in placeholder/title/aria/logs. Tests assert masking.

## Behavior preservation

- Same props contract: `alertConditions: AlertConditionData[]`, `onClose?: () => void`.
- Same optimistic update behavior for language/link/unlink/alert toggles, with rollback.
- Same mount contract in App.tsx — only the import path resolves into the new folder.

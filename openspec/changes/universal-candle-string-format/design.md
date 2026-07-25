## Context

Alert messages in Pine Script use template variables like `{{ticker}}`, `{{close}}`, `{{interval}}` that should be substituted with real values at render time. Currently, substitution is done ad-hoc in `src/strategy/alert-system.ts` (formatMessage) for a subset of variables, duplicated in `backend/src/ws/gateway.ts` (which constructs the Telegram message header but does not substitute body variables), and absent in the frontend. The result is that `{{ticker}}` is never resolved, and any future variable would need to be added in multiple places.

## Goals / Non-Goals

**Goals:**
- Single `formatCandleString(template, context)` function usable from any layer (runtime, backend, frontend)
- Support all current variables: `ticker`, `interval`, `open`, `high`, `low`, `close`, `volume`, `time`, `bar_index`, `timestamp`
- Drop-in replacement for existing `formatMessage` in alert-system.ts
- Backend applies the formatter in the Telegram alert path before sending
- Frontend can import the same module for consistent rendering

**Non-Goals:**
- Not changing the Telegram message escaping / MarkdownV2 handling in TelegramService — only the template substitution
- Not adding Pine Script `str.format()` integration — this is only for internal alert message templates
- Not making variables user-extensible — the set is fixed by the Pine Script alertmessage convention

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Location** | `src/util/candle-string-format.ts` | The module is shared across all three packages (root `src/` is compiled by both `dist/` for engine and is importable by backend via `@pine-framework` path). Frontend can import from a shared path or copy. |
| **API shape** | `formatCandleString(template: string, context: CandleFormatContext): string` | Simple function, no class needed. Context is a plain object with optional fields so each caller provides what it has. |
| **Variable syntax** | `{{name}}` with optional `{name}` fallback | Matches Pine Script `alertmessage` convention (double curlies) and current `formatMessage` behavior (which also handles single-curly `{time}`, `{bar_index}`, `{timestamp}`). |
| **Package sharing** | Root `src/util/` via TypeScript project references | The root `src/` is already the engine package. Backend can import from `@pine-framework` or use a relative import. Frontend can import directly since its Vite config allows root imports. |

## Risks / Trade-offs

- **Risk**: Backend and frontend may not be able to import from `src/util/` cleanly → **Mitigation**: Place the module in a standalone file with no engine-specific dependencies; it becomes trivially portable. If path resolution is an issue, duplicate the file (tested) but enforce a single source-of-truth via a lint rule.
- **Risk**: Existing `formatMessage` in alert-system.ts also handles single-curly brace variants (`{time}`) that the new module must preserve → **Mitigation**: Include both `{{var}}` and `{var}` patterns in the replacement logic.
- **Trade-off**: Making `ticker` available in the runtime `formatMessage` requires passing symbol info through `AlertBarData`. Currently `AlertBarData` doesn't have ticker. Adding it is a small interface change but ensures consistency.

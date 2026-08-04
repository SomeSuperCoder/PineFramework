## Context

See proposal.md — Why/What. The name-derivation regex already exists twice (`frontend/src/App.tsx:176` `extractScriptName`, `frontend/src/components/CodeEditor.tsx:36` `extractName`) with identical logic. Two bot surfaces show raw source instead:

- Review step: `TradingBotPanel.tsx:1558` renders `strategySource.split('\n')[0]?.substring(0, 60)`.
- Running dashboard left panel: `LiveDashboard` renders `status.strategyName` (`TradingBotPanel.tsx:2226`), which `BotEngine.getSnapshot()` (`src/trading/bot-engine.ts:448`) fills with `strategySource.substring(0, 50)`.

The root workspace package `pine-framework` already exports shared code to both frontend and backend via subpath exports (`./utils/time` → `src/utils/time.ts`); both `frontend/package.json` and `backend/package.json` depend on `pine-framework: workspace:*`.

## Goals / Non-Goals

- **Goals**: One shared derivation helper; Review step and dashboard show the derived name; snapshot carries the derived name.
- **Non-Goals**: Changing stored script names or script-bank persistence; name editing; altering indicator-name behavior in editor/quick-add (that path already works and will merely consume the shared helper); touching the mini-chart or chart rendering.

## Decisions

### D1 — Shared helper lives in `pine-framework` root package, exported as a subpath

Place `extractScriptName(source: string): string | null` in `src/utils/script-name.ts` and export it as `pine-framework/utils/script-name` (mirroring `src/utils/time.ts`). Rationale: both frontend and backend already import from this package and its `./utils/*` subpaths; bot-engine (backend runtime) and the two frontend surfaces can then use the identical implementation. Alternative rejected: a frontend-only util (`frontend/src/utils/`) — that would force duplicating the logic in `bot-engine.ts` (backend), defeating SSOT.

### D2 — Helper returns `string | null`; each caller owns its fallback

Return `null` when no positional or `title=` name is found, letting the Review step show `(unnamed strategy)` and the dashboard show `(not configured)` per their contexts. This matches the existing `CodeEditor.extractName` contract (returns `null`) and the spec's requirement. Alternative rejected: a single fallback string baked into the helper — callers have different fallbacks.

### D3 — Prefer positional name, then `title=`

Preserve the existing precedence exactly: positional first string arg, then named `title=`. This keeps the new surfaces consistent with what the editor and quick indicator menu already display, so no behavioral drift across UI.

### D4 — Backend derives name in `getSnapshot()`

`bot-engine.ts` imports `extractScriptName` from `pine-framework/utils/script-name`, applies it to `strategySource`, and truncates to 50 chars for the snapshot (spec: >50 chars truncated). When source is absent or name is `null`, report `(not configured)`. The idle websocket placeholder in `backend/src/ws/bot-gateway.ts` keeps `(not configured)` unchanged.

### D5 — Frontend surfaces consume the helper

- Review step: replace the `split('\n')[0]` expression with `extractScriptName(configValues.strategySource) ?? '(unnamed strategy)'`.
- `LiveDashboard`: already renders `status.strategyName`; no change needed beyond the backend fix (D4).
- `App.tsx` and `CodeEditor.tsx`: delete their local definitions and import the shared helper (DRY).

## Risks / Trade-offs

- [Regex edge cases (quotes inside names, malformed declarations)] → The regex matches the existing behavior already proven in editor/quick-add; a `null` fallback covers odd sources gracefully. Mitigation: unit tests cover single-quote, double-quote, positional, and `title=` forms.
- [Cross-package import may need a dist rebuild for frontend to pick up the new subpath] → The package uses `source` fields for dev; verify `pnpm --filter frontend dev` resolves the new subpath, else run `pnpm build:lib`. Existing `./utils/time` subpath is proof the mechanism works.
- [Truncation to 50 chars may cut a long derived name] → Matches the current 50-char snapshot cap and the spec; acceptable for a status metric.

## Migration Plan

Single commit. No data migration, no storage format change, no rollback concerns: this only changes a displayed string. Deploy backend + frontend together since the dashboard relies on the snapshot change.

## Open Questions

None. Fallbacks and truncation are specified; no deferrable unknowns that would change specs or tasks.

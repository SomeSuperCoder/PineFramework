## Why

The bot Review step and the running dashboard both display raw Pine source text instead of the human-readable strategy name: the Review step shows `strategySource.split('\n')[0]` (typically `//@version=5`), and the running dashboard shows `strategySource.substring(0, 50)`. Users cannot tell which strategy a bot is about to run or is running.

## What Changes

- Derive the strategy display name from the `strategy("Name", ...)` / `strategy(title="Name", ...)` declaration in the source, matching the mechanism already used by the code editor and quick indicator menu.
- Show the derived name in the **Review step** (`Strategy:` row) of the bot setup flow, with a fallback when the source has no declaration.
- Show the derived name in the **running dashboard left panel** (`Strategy` metric) by making the backend status snapshot carry the derived name.
- Centralize the existing duplicated extraction logic (`App.tsx:176` `extractScriptName`, `CodeEditor.tsx:36` `extractName`) into a single shared helper used by all call sites (SSOT/DRY).

## Capabilities

### New Capabilities
- `strategy-name-derivation`: deriving a human-readable script/strategy name from Pine source (positional `"Name"` then `title="Name"`), shared across editor, quick-add, bot setup review, and running dashboard.

### Modified Capabilities
- `bot-start-lifecycle`: the Review step SHALL display the derived strategy name instead of the first line of source; the running dashboard status SHALL expose the derived name in `strategyName`.

## Impact

- `src/trading/bot-engine.ts` — `getSnapshot()` derives `strategyName` from source instead of truncating it.
- `frontend/src/components/TradingBotPanel.tsx` — Review step `Strategy:` row and `LiveDashboard` left panel display the derived name.
- `frontend/src/utils/` — new shared `extractScriptName` helper (SSOT).
- `frontend/src/App.tsx`, `frontend/src/components/CodeEditor.tsx` — refactor to use the shared helper.
- Tests: bot-engine snapshot test, frontend tests for Review step and dashboard.
- Non-goals: no change to script storage naming, no name editing, no indicator-name behavior.

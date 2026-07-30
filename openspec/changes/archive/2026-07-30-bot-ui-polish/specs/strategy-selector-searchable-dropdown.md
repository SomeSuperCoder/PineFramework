# Strategy Selector — Searchable Dropdown

## Problem

The setup wizard's "Configuration" step uses a raw `<textarea>` for pasting Pine Script strategy source code. This is error-prone and assumes the user has the strategy text ready. The app already stores strategies on disk (user scripts) and ships built-in strategies — the user should select from these rather than paste raw code.

## Background

- `QuickAdderPopup.tsx` already fetches and displays scripts from `/api/scripts` and `/api/scripts/built-in` merged into a unified list
- Both API endpoints return `{ scripts: [{ id, name, source, scriptType }] }` — source is included in the response, so no additional fetch on selection
- `BotConfigPanel` currently manages `strategySource` as a raw string state
- `checkStrategyCompatibility()` validates the source for live-trading-incompatible patterns

## Design

### Component: `StrategySelector`

Replace the strategy textarea in `BotConfigPanel` with a new `StrategySelector` component:

```
┌─────────────────────────────────────────────┐
│  🔍 Search strategies...         [Clear]   │
├─────────────────────────────────────────────┤
│  ○ SMACrossOver (strategy)         Built-In │  ← highlighted
│  ○ MacdDivergence (strategy)               │
│  ○ MyStrategy (strategy)                   │
│  ○ RsiStrategy (strategy)                  │
│  ○ ...                                     │
├─────────────────────────────────────────────┤
│  Selected: SMACrossOver                     │
│  [✓] Source loaded (415 bytes)             │
└─────────────────────────────────────────────┘
```

### Data Flow

1. On mount, `StrategySelector` calls `GET /api/scripts` and `GET /api/scripts/built-in` (same as `QuickAdderPopup`)
2. Merges both lists, filters to only `type === 'strategy'`
3. Displays a search input + scrollable list
4. On selection: stores `{ id, name, source }` in parent state
5. `checkStrategyCompatibility()` runs on the selected source (same as before)

### States

| State | Behavior |
|-------|----------|
| Loading | Show "Loading strategies..." with spinner |
| Empty (no strategies at all) | Show "No strategies found. Write one in the editor first." + link to invite user to write a strategy |
| Empty (search yields nothing) | Show "No strategies matching 'XYZ'" |
| Selected | Show the strategy name + confirmation, source is loaded into parent state |
| Error (fetch failed) | Show "Could not load strategies. Is the backend running?" with retry button |

### Integration

- Replace `strategySource` textarea in `BotConfigPanel` with `<StrategySelector .../>`
- `StrategySelector` is always visible (not inside a dropdown/modal — it's the actual input)
- The "Apply Configuration" button behavior is unchanged — it still POSTs to `/api/bot/configure` with the source
- `checkStrategyCompatibility()` runs on the selected source, same as before
- A "Paste raw source" toggle/button is available for users who still want to paste Pine code directly (falls back to a textarea)

### CSS

Reuse existing pattern from `QuickAdderPopup.css`:
- Search input: same style as `.quick-adder-search`
- List items: same as `.quick-adder-item`
- Selected item: distinct style (green border/checkmark)
- Type badges: reuse `.badge-type`, `.badge-strategy`, `.badge-built-in`

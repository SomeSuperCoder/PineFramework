# Symbol × Timeframe Matrix Table

## Problem

The setup wizard currently uses a free-text `<textarea>` for trading pairs, expecting `SYMBOL TIMEFRAME` per line. This is error-prone (typos, invalid timeframes, invisible whitespace) and provides no discoverability of available symbols.

## Background

- `VALID_TIMEFRAMES` is already defined in `TradingBotPanel.tsx` as `new Set(['1', '3', '5', '15', '30', '60', '120', '240', 'D', 'W', 'M'])`
- The app uses symbols like `BTCUSDT`, `ETHUSDT`, `SOLUSDT` — these are the available trading assets
- The backend `DEFAULT_SYMBOLS` contains the canonical list: `['SOLUSDT', 'BTCUSDT', 'ETHUSDT', 'BONKUSDT', 'ORCAUSDT', 'JUPUSDT', 'PYTHUSDT', 'RAYUSDT', 'WIFUSDT']`
- Currently `parsePairLine()` handles the textarea parsing; `BotConfigPanel` tracks `pairsText` state
- Auto-select can override pairs after evaluation

## Design

### Component: `PairMatrixTable`

Replace the pairs textarea with an interactive table:

```
┌──────────────────────────────────────────────────────────────┐
│  Trading Pairs                     [Add Row] [+ Add Symbol] │
├──────────┬────────────┬────────────────────────────────────┤
│ Symbol   │ Timeframe  │                                    │
├──────────┼────────────┤                                    │
│ [SOLUSDT ▼] │ [60 ▼]  │  [×]                              │
│ [BTCUSDT ▼] │ [240 ▼] │  [×]                              │
│ [ETHUSDT ▼] │ [60 ▼]  │  [×]                              │
├──────────┴────────────┴────────────────────────────────────┤
│ 3 pairs configured           ✓ All timeframes valid        │
└──────────────────────────────────────────────────────────────┘
```

### Behavior

**Default rows:** 3 rows pre-populated:
- `SOLUSDT` → `60`
- `BTCUSDT` → `240`
- `ETHUSDT` → `60`

**Symbol column:** `<select>` dropdown populated with the known symbol list (`DEFAULT_SYMBOLS`). If the user types a symbol not in the list (e.g., a new token), a free-text option is available at the bottom of the dropdown (with a "Custom…" entry that enables a text input).

**Timeframe column:** `<select>` dropdown populated from `VALID_TIMEFRAMES`, rendered as:
- `1` → `1m`
- `3` → `3m`
- `5` → `5m`
- `15` → `15m`
- `30` → `30m`
- `60` → `1h`
- `120` → `2h`
- `240` → `4h`
- `D` → `1d`
- `W` → `1w`
- `M` → `1M`

**Add Row:** Appends a new empty row with default symbol and timeframe.

**Remove Row:** Each row has an `[×]` button.

**Duplicate validation:** When a user adds a row that duplicates an existing (symbol, timeframe) pair, show an inline warning on the row: "⚠ Duplicate pair" and dim the row. The "Apply Configuration" button is disabled if duplicates exist.

### States

| State | Behavior |
|-------|----------|
| Normal | Table with rows, all valid |
| Loading symbols | Not applicable — symbols are hardcoded |
| Duplicate pair | Row dimmed with warning icon; submit disabled |
| Single row remaining | Remove button still enabled, warning "At least 1 pair required" if user tries to remove last |
| Empty rows (0 pairs) | Show "Add at least one trading pair" inline message; submit disabled |

### Validation

- Each row is validated independently (symbol non-empty, timeframe in `VALID_TIMEFRAMES`)
- Duplicate detection: same symbol + same timeframe in two rows = invalid
- Show a summary at bottom: "3 pairs configured" in green, or "⚠ 1 pair has duplicate symbol/timeframe" in orange

### Integration

- Replace `pairsText` textarea + the "Trading Pairs (SYMBOL TIMEFRAME per line)" label section in `BotConfigPanel`
- Remove `parsePairLine()` and `invalidTimeframeLines` logic (replaced by structured state)
- `ConfigValues.pairs` retains the same `Array<{ symbol: string; timeframe: string }>` shape — no backend changes needed
- The review step in `SetupWizard` still displays pairs as `${symbol} ${timeframe}` — no changes needed

### CSS

- Table layout with `display: grid` or HTML `<table>` with dark theme
- Rows: `#111128` background, `#1a1a2e` hover
- Dropdowns: same style as existing `<select>` in `BotConfigPanel`
- Remove button: `#e94560` with `#2a1520` background
- Duplicate row: opacity 0.5 with orange border
- Add Row button: outlined style matching the "Apply Configuration" button but smaller

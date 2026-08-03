## Context

The manual selection mode in `TradingBotPanel.tsx` (lines 1308-1360) uses hardcoded `<select>` elements for pair and timeframe. The `PairConfig` type (`{ symbol: string; timeframe: string }`) already accepts any string, so the backend is not a constraint.

The current manual mode UI:
```tsx
<select value={manualPair?.symbol ?? ''}>
  <option value="BTCUSDT">BTC/USDT</option>
  <option value="ETHUSDT">ETH/USDT</option>
  <option value="SOLUSDT">SOL/USDT</option>
</select>
```

## Goals / Non-Goals

**Goals:**
- Replace `<select>` with `<input>` for pair and timeframe
- Add quick-select chips for common timeframes
- Show a warning for non-default symbols
- Maintain backward compatibility with existing `PairConfig` type

**Non-Goals:**
- Autocomplete/search (future enhancement)
- Fetching live symbol list from Bybit API
- Changing the backend or `PairConfig` type

## Decisions

### Decision 1: Use text input with warning chips
**Choice**: Free-text `<input>` with a row of clickable timeframe presets below
**Rationale**: Maximum flexibility while keeping common choices accessible
**Alternatives considered**: 
- Dropdown with "Custom" option (rejected — adds unnecessary complexity)
- Autocomplete (rejected — scope creep, future enhancement)

### Decision 2: Warn but don't block non-default symbols
**Choice**: Show a subtle warning for symbols not in `DEFAULT_SYMBOLS`, but allow submission
**Rationale**: Power users may know valid Bybit symbols not in our defaults
**Alternatives considered**: Block non-default symbols (rejected — defeats the purpose)

### Decision 3: Timeframe presets as chips
**Choice**: Show `1m, 5m, 15m, 30m, 1h, 4h, 1d` as clickable chips that fill the input
**Rationale**: Quick access to common timeframes without typing
**Alternatives considered**: Keep only text input (rejected — worse UX for common cases)

## Risks / Trade-offs

**[Risk]** Users may enter invalid timeframes → **Mitigation**: Validate numeric input, show clear error
**[Risk]** Users may enter wrong symbol format → **Mitigation**: Auto-uppercase, warn if not in default list

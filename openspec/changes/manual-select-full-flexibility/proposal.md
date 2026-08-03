## Why

The manual selection mode in the setup wizard hardcodes only 3 trading pairs (BTC, ETH, SOL) and 4 timeframes (5m, 15m, 1h, 4h). Meanwhile, the auto-backtest evaluates 7 pairs × 4 timeframes = 28 combinations. Users choosing manual mode deserve the same flexibility — or more. The backend's `BybitBarFetcher` already supports any symbol Bybit offers, so the restriction is purely a frontend limitation.

## What Changes

- Replace hardcoded `<select>` dropdowns for pair and timeframe in manual mode with free-text input fields
- Add validation against Bybit's available symbols (fetched from backend or hardcoded list)
- Show a warning if the user enters a symbol not in the default list, but allow it anyway
- Add common timeframe presets as quick-select chips alongside the text input
- Keep the auto-backtest mode unchanged

## Capabilities

### New Capabilities

- `manual-select-free-input`: Replace restricted dropdowns with free-text inputs for pair and timeframe selection in manual mode, allowing users to trade any Bybit-supported pair

### Modified Capabilities

(None — this extends UI flexibility without changing spec-level behavior)

## Non-Goals

- Changing the backend API or WebSocket protocol
- Adding new trading pairs to the auto-backtest defaults
- Implementing autocomplete or search-as-you-type (future enhancement)

## Impact

- Frontend only: `frontend/src/components/TradingBotPanel.tsx`
- No backend changes required
- The `PairConfig` type already accepts any string for `symbol` and `timeframe`

## Why

The trading pair symbols currently use USDT (e.g., BTCUSDT, ETHUSDT) because price data comes from Bybit which uses USDT pairs. However, actual on-chain swaps on Solana use USDC as the quote token. This creates a mismatch where users see "USDT" pairs but the bot trades against USDC. This should be corrected to accurately reflect what we trade.

## What Changes

- Rename all trading pair symbols from USDT to USDC (e.g., BTCUSDT → BTCUSDC)
- Update the token registry with USDC-based pair symbols
- Update frontend dropdowns to display USDC pairs
- Update backend trading code to reference USDC pairs
- Update price data fetching to use Bybit's USDC pairs (where available)
- Keep USDT as a fallback for Bybit data if USDC pairs aren't available

## Capabilities

### Modified Capabilities
- `token-type-system`: Pair symbols change from USDT to USDC quote
- `token-registry`: Registry entries updated with USDC pair symbols
- `manual-select-dropdowns`: Dropdown options updated to USDC pairs

## Non-goals

- Change the actual USDC mint address (already correct)
- Modify the Jupiter DEX integration (already uses USDC)
- Update historical price data cache

## Impact

- **Frontend**: `App.tsx`, `TradingBotPanel.tsx` dropdowns
- **Backend**: `token-registry.ts`, all files importing `TRADABLE_PAIRS` or `TOKEN_MINTS`
- **Data**: Bybit API calls may need to handle USDC pairs vs USDT pairs
- **Breaking**: Pair symbols change — any external references to old symbols will break

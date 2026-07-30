## Why

When importing a wallet, users see only the public key (truncated). There's no way to confirm it's the right wallet without checking externally. Showing the USDC balance immediately after import lets users verify they imported the correct wallet before proceeding.

## What Changes

- Backend: Add endpoint to fetch USDC balance for a public key
- Frontend: Fetch and display USDC balance after wallet import
- Frontend: Show balance in the wallet status area

## Capabilities

### New Capabilities

- `usdc-balance-fetch`: Fetch SPL token balance for a given public key from Solana RPC
- `wallet-balance-display`: Show token balance in wallet UI after import

### Modified Capabilities

- `backend-api-server`: New endpoint GET /api/bot/wallet/balance

## Impact

- `backend/src/routes/bot.ts` — new endpoint
- `backend/src/index.ts` — register balance route
- `frontend/src/components/TradingBotPanel.tsx` — fetch and display balance after import

## Non-goals

- Real-time balance updates (static fetch on import)
- Multi-token support (USDC only for now)
- Balance caching

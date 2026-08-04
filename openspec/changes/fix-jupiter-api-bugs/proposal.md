## Why

Chaos mode cannot test the real Jupiter API integration due to 3 critical bugs. When running with $7 on mainnet, the bot either sends dust amounts ($0.0001), gets API validation errors from malformed route data, or defaults to devnet. These bugs must be fixed to validate the bot's ability to handle real Jupiter API calls before expanding chaos mode testing.

## What Changes

- **Fix unit mismatch**: Chaos mode initializes with `CHAOS_INITIAL_CAPITAL_LAMPORTS = 10_000_000_000` (simulated $10,000), causing `executeSignal()` to calculate swap amounts as dust (~100 lamports). The executor must use the actual wallet balance instead of the simulated capital.

- **Fix route format**: JupiterSwapAdapter's `quote()` method converts `routePlan` array to a string (`"amm1 → amm2"`), then `swap()` sends this string back. Jupiter API v6 expects the `routePlan` array. The adapter must preserve the original array format.

- **Fix devnet default**: `createSolanaConfig()` defaults to `devnet`. While this is safe for development, chaos mode testing with real funds requires mainnet. The adapter should respect the `SOLANA_NETWORK` environment variable and log which network is being used.

## Capabilities

### Modified Capabilities
- `jupiter-swap-adapter`: Fix route format preservation and network configuration
- `chaos-mode-execution`: Fix unit mismatch so swap amounts reflect real balance

## Impact

- **Files**: `src/trading/dex/jupiter-swap-adapter.ts`, `src/trading/live-strategy-executor.ts`, `src/trading/solana-config.ts`
- **API**: Jupiter Swap API v6 (quote + swap endpoints)
- **Behavior**: Chaos mode will now send real USDC amounts to Jupiter on mainnet
- **Risk**: Successful fixes mean real money trades; ensure error handling is robust

## Non-goals

- Modifying the chaos signal generation logic
- Adding new risk management features
- Changing position sizing (remains 10% of balance)
- Fixing the Ultra adapter (out of scope)

## Why

The bot now opens real on-chain positions on Solana (live trading confirmed), but stopping it — via `POST /api/bot/stop`, `POST /api/bot/emergency-stop`, or internal risk-breach handlers — leaves every open position **unflattened on-chain**. `BotEngine.shutdown()` only disconnects the feed and persists state; the "close positions" step is a `// Phase 2` comment stub. For a real-money wallet this is a silent-loss risk: a stopped bot with tokens still on-chain.

## What Changes

- Add a `CloseManager` that, on every bot stop (normal **and** emergency), enumerates open positions from `engine.getPositions()` and reverse-swaps each (base → USDC) through the proven Jupiter path, confirming each close on-chain before marking it closed.
- Both stop paths (`stop()` and `emergencyStop()`) call the close manager; the state machine still guarantees the bot always reaches `Stopped` within a bounded deadline (emergency 30s / graceful 60s), even if some closes fail.
- Position removal is gated on a confirmed swap transaction signature — never on sim state (anti-sim-divergence rule).
- Failed closes leave the position on-chain, keep it in `getPositions()`, emit a `close_failed` warning (Telegram `notifyWarning` + in-process `recordError(..., Warning)`), and are reported in a `stop_completed` aggregate.
- **SIGINT/SIGTERM** (Ctrl-C / server shutdown) currently bypasses the engine entirely — the backend shutdown path will also trigger the engine's stop sequence so closes run on process exit too.
- The swap adapter's failure path will carry the send signature (additive optional field) so a confirm-timeout race can be checked read-only before any retry — retries can never double-sell.

## Capabilities

### New Capabilities
- `stop-close-all`: On any bot stop (normal, emergency, risk-breach, process signal), gracefully close all open positions via confirmed on-chain reverse swaps; report per-position and aggregate outcomes; never fabricate a close.

### Modified Capabilities

<!-- None: no existing spec in openspec/specs/ covers bot stop/shutdown behavior (verified). -->

## Non-goals

- Partial closes / position sizing on close (always full-position close).
- Take-profit / limit exits — market close only (quote + slippage).
- Background auto-retry sweeper (manual one-shot "close remaining" instead).
- Order-cancellation machinery (Solana has no mempool; in-flight entries are drained via the scheduler mutex).
- Wallet-balance reconciliation as a close-time mechanism (separate tracked sim-divergence fix).
- `finalized`-commitment accounting (keep `confirmed`, same as the buy path).
- Multi-wallet / multi-keypair support.

## Impact

- **New file:** `src/trading/close-manager.ts` — `CloseManager` (DI'd into `BotEngine`).
- **Modified:** `src/trading/bot-engine.ts` (stop paths call close manager; SIGINT/SIGTERM wiring lives in backend), `backend/src/index.ts` (process-signal shutdown triggers engine stop), `src/trading/dex/jupiter-swap-adapter.ts` + `src/trading/solana-wallet.ts` (signature preserved on confirm-failure path), `src/trading/dex/dex-adapter.ts` (SwapResult optional `signature` on failure documented).
- **Events/logs:** `stop_started`, `close_started`, `position_closed`, `close_failed`, `stop_completed` (aggregate), all tagged `closeRunId`.
- **Tests:** new `close-manager.test.ts`; regression tests for stop paths, signature-carrying failure path, no-double-sell retry rule.
- **No frontend change** in v1 (warning channel is Telegram + status endpoint).

## Why

The live trading bot executes real DEX swaps but **nothing persists a closed trade**. Confirmed fills live only in a runtime map, PnL is computed in exactly one place and fed only to the risk manager, and the dashboard's metrics are dead stubs (`realizedPnl: 0` "Phase 2"). The Director cannot see what the bot actually did, what it earned, or which strategy/timeframe/asset performed. A dormant, unit-tested `TradeHistoryStore` already exists — it is simply never wired in.

## What Changes

- **Persist every closed trade** with PnL to the existing JSONL `TradeHistoryStore` (wire it into the live executor's close path — the one place realized PnL is computed, shared by live and chaos mode).
- **Extend the trade record** additively with `strategy` (derived script name), `timeframe`, `mode` (`live` | `chaos`), and `status` (`confirmed` | `unknown`) so history is groupable per strategy script / timeframe / asset and chaos trades are distinguishable.
- **Record unknown-outcome closes** (swap may have landed but the engine can't confirm) with `status: 'unknown'` instead of losing them.
- **New read-only REST API**: browsable trade history (cursor pagination + filters) and statistics (global + grouped by strategy / timeframe / asset) with PnL and trading metrics. Mounted independently of the `ENABLE_TRADING_BOT` gate so history is readable even when the bot flag is off.
- **Statistics dashboards in the bot UI**: global PnL + trading-metric cards, equity curve and grouped PnL charts (hand-rolled canvas, matching the zero-dependency house style), and a browsable, sortable, filterable trade table. Chaos mode appears as its own strategy ("Chaos Mode") with an explicit live-vs-chaos split in stats.

## Capabilities

### New Capabilities
- `trade-history`: persistent, browsable record of closed trades with PnL, filters (strategy/timeframe/asset/mode/status), cursor pagination, and grouped statistics.
- `trading-stats-dashboard`: bot UI section showing global PnL and trading metrics with charts, and a browsable trade-history table, categorized per strategy script / timeframe / asset, with chaos mode masked as a strategy.

### Modified Capabilities
<!-- None: strategy execution behavior itself is unchanged; trade recording is additive (no requirement change to existing specs). -->

## Impact

- **Core engine** (`src/trading/`): `TradeRecord` type gains optional fields (`strategy`, `timeframe`, `mode`, `status`) — additive, backward-compatible with existing JSONL lines. `TradeHistoryStore` gains filters, grouped stats, tolerant line parsing, a prune bug fix, and cursor pagination.
- **Live executor** (`live-strategy-executor.ts`): records a closed trade at the close path (`recordClosedTradeRisk`) and at the unknown-outcome catch — PnL remains expected-price based and gross (fees stored as available estimate; net computed at stats time).
- **Backend** (`backend/src/`): new `TradeHistoryStore` instance constructed outside the bot gate; new routes for history + stats; optional `bot:trade` WS event.
- **Frontend** (`frontend/src/components/`): new dashboard tabs (Overview / Trade History / Statistics) with canvas charts and a filterable trade table.
- **Tests**: store tests (new fields, grouped stats, legacy lines, pagination, prune fix), route tests, frontend component tests, Playwright user-flow e2e.
- **No new dependencies.** No `BREAKING` changes.

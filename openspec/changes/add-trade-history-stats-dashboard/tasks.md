# Tasks — Add Trade History & Statistics Dashboard

Grouped by dependency order. Each task is one microtask, verified before the next.

## 1. Core store extension (spec: `trade-history`; design: D1, D5)

- [ ] 1.1 Extend `TradeRecord` type (src/trading/types.ts) additively with optional `strategy`, `timeframe`, `mode: 'live' | 'chaos'`, `status: 'confirmed' | 'unknown'` fields (backward compatible with legacy JSONL lines)
- [ ] 1.2 Fix `pruneDebugSnapshots` dir-as-file bug in `src/trading/trade-history-store.ts` (read directory listing, prune oldest snapshots to `maxDebugSnapshots`)
- [ ] 1.3 Make `TradeHistoryStore.getTrades` tolerant to corrupt/legacy JSONL lines (skip invalid lines; default missing new fields to absent) and add filters: `strategy`, `timeframe`, `mode`, `status`, time window (`from`/`to` on `closedAt`)
- [ ] 1.4 Add cursor pagination to `getTrades`: `since` (closedAt cursor) + `limit`, returning `hasMore` and `nextCursor`
- [ ] 1.5 Extend stats model: add `netPnl`, `profitFactor`, `avgTrade`, `bestTrade`, `worstTrade`, `maxDrawdown` (from cumulative-PnL equity curve); default excludes `status: unknown`
- [ ] 1.6 Add grouped stats: `getStats(groupBy: 'global' | 'strategy' | 'timeframe' | 'asset', filters)` returning per-group metrics, zero-trade groups omitted; memoize with dirty flag on append
- [ ] 1.7 Add rotation/archival guard beyond a high line count (e.g., ~50k) so reads stay fast
- [ ] 1.8 Extend `tests/unit/trading/backend-services.test.ts` (or add store tests): new fields, filters, legacy lines, corrupt lines, pagination, grouped stats, memoization, prune fix

## 2. Capture wiring (spec: `trade-history`; design: D2, D3)

- [ ] 2.1 Thread an optional `TradeHistoryStore` reference from `BotEngine` construction into the executor's close path (`recordClosedTradeRisk`, live-strategy-executor.ts:1358) — absent store = byte-identical current behavior
- [ ] 2.2 Record a closed trade at the close path with: strategy name from `extractScriptName` (truncated 50), pair timeframe, symbol, entry/exit expected prices, size, gross realized PnL, available fee estimate, `mode: 'live'`, `status: 'confirmed'`, timestamps
- [ ] 2.3 Record unknown-outcome closes (catch at live-strategy-executor.ts:676) with `status: 'unknown'` — fail-safe, never block
- [ ] 2.4 Record chaos closes with `strategy: "Chaos Mode"`, `mode: 'chaos'` (they flow through the same close path)
- [ ] 2.5 Construct the store in `backend/src/index.ts` outside the `ENABLE_TRADING_BOT` gate and inject it into the engine + router
- [ ] 2.6 Add tests for capture: live confirmed, chaos, unknown-outcome, store-absent fail-safe (extend `tests/unit/trading/**`)

## 3. API (spec: `trade-history`; design: D4)

- [ ] 3.1 Add `backend/src/routes/trade-history.ts` factory `createTradeHistoryRouter({ getStore })`: `GET /api/bot/history` with filters + cursor pagination, `{ success, trades, hasMore, nextCursor }` envelope
- [ ] 3.2 Add `GET /api/bot/stats` with `groupBy` + filters, `{ success, summary, groups? }`, zero-groups omitted, non-2xx + `{ success: false, error }` on hard errors
- [ ] 3.3 Mount the router at `/api` outside the `ENABLE_TRADING_BOT` gate in `backend/src/index.ts`
- [ ] 3.4 Emit `bot:trade` WS event after each append (in the engine or a subscriber) for live UI updates
- [ ] 3.5 Add route tests (`backend/tests/`): history filters/pagination, stats global + grouped, gate-independence (bot flag off still serves), error envelope

## 4. Frontend dashboards (spec: `trading-stats-dashboard`; design: D6)

- [ ] 4.1 Add tab bar (Overview | Trade History | Statistics) to `LiveDashboard` (TradingBotPanel.tsx), preserving the existing 3-column overview
- [ ] 4.2 Trade History tab: sortable/filterable (strategy/timeframe/asset/mode) table with cursor pagination, PnL/fees/status columns, house styling
- [ ] 4.3 Statistics tab: global metric cards (total trades, win rate, gross/net PnL, fees, profit factor, avg win/loss, best/worst, avg trade, max drawdown)
- [ ] 4.4 Statistics tab: hand-rolled canvas equity curve (cumulative PnL over close time) + grouped PnL bar charts per strategy/timeframe/asset (reuse `BacktestResults` canvas primitive)
- [ ] 4.5 Data hooks: REST fetch for history/stats + `bot:trade` WS handler; refetch on WS reconnect; empty + error states
- [ ] 4.6 Design polish via `impeccable` skill; dark-theme consistency; live-vs-chaos toggle with "Chaos Mode" visible as its own strategy group
- [ ] 4.7 Frontend component tests (extend `TradingBotPanel.test.tsx` pattern): tabs render, filters work, empty/error states, chaos toggle
- [ ] 4.8 Playwright e2e: user browses trade history, filters, pages; statistics cards + charts render with mocked backend data; empty state

## 5. Verification & sign-off

- [ ] 5.1 Run full suite (typecheck + lint + vitest + Playwright) via Test Engineer; report GREEN/RED
- [ ] 5.2 Code Reviewer: review the full diff against specs; static analysis
- [ ] 5.3 QA Engineer: verify every acceptance criterion in both specs; regression check; GO/NO-GO
- [ ] 5.4 Tech Lead: consume verdicts, commit verified work at feature boundaries

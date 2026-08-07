# Design — Trade History & Statistics Dashboard

## Context

See `proposal.md` (Why). The verified current state (3 scouts + capture-point verification):

- A dormant, unit-tested `TradeHistoryStore` (JSONL append-only, per-bot file) exists in `src/trading/trade-history-store.ts` with `recordTrade` / `getTrades({symbol?,since?,until?,limit?})` / `getStats()`. Zero production callers.
- `TradeRecord` (src/trading/types.ts:230-244) lacks `strategy`, `timeframe`, `mode`, `status`.
- PnL is computed in exactly one place — `recordClosedTradeRisk` (`live-strategy-executor.ts:1358-1394`) — using **expected** prices (`signal.expectedPrice`, `signal.positionEntryPrice`), fed only to the risk manager. Chaos closes share this path (dispatch at :356 → `processCandleChaos` → `executeSignal` → :665 → :1358).
- Unknown-outcome closes (catch at :676-695) bypass PnL recording entirely.
- Fee fields exist on `Quote`/`SwapResult` but values are a fixed 5bps estimate (Ultra) or `'0'` (Swap); no real Jupiter fee is parsed. `SwapResult` has no price field.
- Strategy identity = single global `extractScriptName(strategySource)` (truncated 50 chars). No per-pair names.
- SQLite `pine-framework.db` is orphaned legacy (zero code opens it; `node:sqlite` needs Node ≥22.5 vs engines ≥20).
- Frontend: zero chart libs, no router; `BacktestResults.tsx` is the hand-rolled canvas + stat cards + sortable table precedent. Bot dashboard = fixed overlay, 3-column grid, WS `/ws/bot` + REST `/api/bot/*`. `bot:metrics` WS channel is dead; snapshot PnL stubs are hardcoded `0`.

## Goals / Non-Goals

**Goals**
- Persist every closed trade (live + chaos) with realized PnL, browsable via API + UI.
- Aggregate metrics global and per strategy / timeframe / asset, with charts.
- Chaos mode surfaced as its own strategy, never silently mixed into live stats.
- Zero new runtime dependencies; follow existing house patterns end-to-end.

**Non-Goals (v1)**
- Real on-chain fill prices or real Jupiter fee parsing (no `SwapResult`/quote extension, no signature change to the PnL path).
- Live equity recalculation from current prices; PnL is expected-price based.
- Auth on the new read-only endpoints (matches existing zero-auth server; flag for later).
- Interactivity beyond basic charts (tooltips/hover are out of v1).
- Backtest trade ingestion (backtest results already have their own export surface).

## Decisions

### D1 — Storage: wire + extend the existing JSONL `TradeHistoryStore` (not SQLite, not a new JsonStore)
- **Why:** the store already exists and is unit-tested; JSONL append-only is a perfect fit for an append-mostly trade log; reads are a bounded in-memory scan (single bot, < a few thousand trades) — trivially fast for groupBy stats. Reversibility is high (SQLite later = replay JSONL).
- **Alternatives rejected:** SQLite via `node:sqlite` — forces Node engines bump (≥22.5 vs ≥20) and revives an orphaned DB for zero current benefit. New `JsonStore` store — duplicates tested code and rewrites a whole file per trade (O(n) per append).
- **Additions to the store:** tolerant line parsing (skip corrupt lines, mirror `sanitizeJson`), filter by `strategy`/`timeframe`/`mode`/`status` + time window, grouped stats (`groupBy`), cursor pagination (`since`+`limit`+`hasMore`/`nextCursor`), memoized stats with a dirty flag, rotation/archival at ~50k lines, and **fix the `pruneDebugSnapshots` dir-as-file bug** (we're betting on this store). Single-writer discipline: only the engine writes.

### D2 — Capture point: record at the close, both confirmed and unknown
- Record a closed trade at the shared close path (`recordClosedTradeRisk`), the only place realized PnL is computed. Chaos closes reach it automatically — no separate chaos path.
- **Unknown-outcome closes** (catch at :676): record with `status: 'unknown'` — never block, never lose history at the worst moment.
- **Fees:** fees are **not stored** — `realizedPnl` is **gross only**. The only available fee source (Jupiter Ultra, fixed 5bps) is denominated in input-token lamports, unit-incompatible with USDC-denominated PnL (using it would inject a ~1e6× unit error), so no estimate is persisted. Net PnL is a **Non-Goal** in this change: deferred to a future change that parses real Jupiter fee data with unit-safe conversion. No `net` column is exposed.
- **Buy side:** do not record buys as separate rows. `TradeRecord` is one open→close line, recorded at close with `side` = open direction.
- **Wiring:** the store instance is constructed in `backend/src/index.ts` (outside the `ENABLE_TRADING_BOT` gate); it is passed into `BotEngine` construction and threaded to the executor's close path as an optional reference. If the store is absent, trading behavior is byte-identical to today (fail-safe).

### D3 — Strategy identity & chaos masking
- Every record carries the single global script name from `extractScriptName(strategySource)` (same value the dashboard already shows), truncated to 50 chars.
- Chaos trades: `strategy: "Chaos Mode"`, `mode: 'chaos'`; live trades: `mode: 'live'`. The `mode` dimension is orthogonal and future-proof (backtest/paper later). Chaos appears as its own strategy group in the UI, and default stats/API filter `mode: live` excludes it; `excludeMode` / `mode=all` opts in.
- Legacy lines (missing new fields) bucket as `unknown`/absent and never crash reads.

### D4 — API design
- New router factory `createTradeHistoryRouter({ getStore })` in `backend/src/routes/trade-history.ts`, mounted at `/api` **outside** the `ENABLE_TRADING_BOT` gate so history is readable even when the bot flag is off. The store is file-pointed at module init, so it reads even when no engine is constructed.
- Endpoints:
  - `GET /api/bot/history?symbol=&timeframe=&strategy=&mode=live|chaos|all&status=confirmed|unknown|all&from=&to=&since=&limit=` → `{ success, trades, hasMore, nextCursor }`
  - `GET /api/bot/stats?groupBy=global|strategy|timeframe|asset&mode=&status=&symbol=&timeframe=&strategy=&from=&to=` → `{ success, summary, groups? }` (groups present only when `groupBy != global`; zero-trade groups omitted)
- **Envelope:** follow the bot convention `{ success: true, ... }`; hard errors → non-2xx + `{ success: false, error }`.
- **Pagination:** cursor (`since` = last seen `closedAt`) + `limit`, never offset — the file grows append-only and offset pagination drifts.
- **Stats memoization:** dirty-flag on append; recompute once per mutation, serve cached. `bot:trade` WS event emitted after each append for live UI updates (frontend also refetches REST on WS reconnect).

### D5 — Statistics model
- Extend `TradeStats` with: `netPnl` (equals `grossPnl` until real fees are parsed — fees=0), `profitFactor`, `avgTrade`, `bestTrade`, `worstTrade`, `maxDrawdown`, plus per-dimension groups. All computed over the **filtered** record set; default excludes `status: unknown` unless requested.
- `maxDrawdown` from the equity curve (cumulative PnL over close time), computed on scan.

### D6 — Frontend: tabs inside the bot dashboard, hand-rolled canvas
- Add a tab bar at the top of `LiveDashboard`: **Overview | Trade History | Statistics**. Zero router/overlay risk; works while running or stopped (history is readable regardless).
- **Trade History tab:** sortable, filterable (strategy/timeframe/asset/mode), cursor-paginated table mirroring `BacktestResults` styling; PnL (gross)/Fees/status columns — the Fees column shows $0.00 in this version (fees not included; real fee parsing deferred).
- **Statistics tab:** metric cards (global summary) + equity curve canvas chart + grouped PnL bar charts (strategy/timeframe/asset) — hand-rolled canvas, reusing the `BacktestResults` equity-polyline primitive. **No new chart library** (house precedent is deliberately zero-dep; a lib can swap in later without touching the JSON API).
- Data hooks: REST fetch for history/stats + `bot:trade` WS handler for live updates; refetch on reconnect.
- Design polish via the `impeccable` skill; matches the dark-theme palette (`#0d0d18` bg, green/red PnL accents).

## Risks / Trade-offs

- **[PnL is expected-price based, not executed]** → Mitigation: document as estimates in the API/UI ("est." label); `SwapResult` extension deferred (D2/D4). Do not claim real fill accuracy.
- **[Displayed PnL is gross — fees are not deducted]** → Mitigation: documented limitation; the only available fee estimate (Jupiter Ultra, fixed 5bps) is unit-incompatible (input-token lamports vs USDC), so fees are intentionally not stored; UI labels PnL as "gross (fees not included)"; no net column in this change. Real fee parsing is deferred to a future change with unit-safe conversion.
- **[Unknown-outcome rows may be false closes]** → Mitigation: default stats exclude `status: unknown`; history shows the status column; explicit opt-in filter.
- **[Chaos PnL polluting "live" numbers]** → Mitigation: default `mode: live` filter; explicit live-vs-chaos split in UI; "Chaos Mode" group separate.
- **[JSONL grows unbounded]** → Mitigation: rotation/archival past ~50k lines; tolerant reads; still fine at single-bot scale.
- **[Adding a write hook in the executor could disturb the live bot]** → Mitigation: optional store reference (absent = byte-identical behavior), fail-safe try/catch around recording, single writer.
- **[pruneDebugSnapshots bug]** → Mitigation: fixed as part of this change (the store becomes production-critical).

## Migration Plan

1. Land core-store changes (types + store extensions + bug fix) with tests — no behavior change yet (store still unwired).
2. Land capture wiring (executor records trades; unknown-outcome path; store constructed in index.ts outside gate) with tests.
3. Land API router + WS event with route tests.
4. Land frontend tabs + tables + canvas charts with component tests + Playwright e2e.
5. Deploy: no migration of existing data needed — JSONL files created on first trade; old files (none in production today) read tolerantly. Rollback: revert commit at any boundary; history stops growing, existing data untouched.

## Open Questions

None — decisions above resolve all unknowns that would change specs or task breakdown. Real-fee parsing and fill prices are explicitly deferred (Non-Goals) and can be added later without contract changes.

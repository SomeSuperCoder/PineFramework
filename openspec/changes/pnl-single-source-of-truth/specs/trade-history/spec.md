# trade-history Delta Spec

## MODIFIED Requirements

### Requirement: Trade persistence on close

The system SHALL persist a trade record whenever the live trading engine closes a position (sell/close signal) with a realized PnL, and SHALL persist the trade even when the swap's on-chain outcome is unknown to the engine (marked `status: unknown`). Each persisted record SHALL include: unique id, bot id, symbol/asset, entry price, exit price, size, gross PnL, net PnL (computed by the shared `pnl-calculation` module), total fees with fee breakdown, a `feesUnknown` flag when the on-chain fee is not observable, DEX kind, optional transaction signature, open timestamp, close timestamp, strategy script name, timeframe, mode (`live` | `chaos`), and status (`confirmed` | `unknown`). The `realizedPnl` field SHALL be the NET PnL (gross minus all fees). The `feesUnknown` flag SHALL be reported when the fee total is not based on observed data, and SHALL NOT be silently reported as zero fees.

#### Scenario: Live trade closed successfully
WHEN the engine closes a live position with a confirmed swap outcome
THEN a record with `mode: live` and `status: confirmed` is appended to persistent storage
AND the record contains symbol, timeframe, strategy name, entry/exit prices, size, gross PnL, net realized PnL, fee breakdown, and any `feesUnknown` flag

#### Scenario: Chaos trade closed
WHEN the engine closes a chaos-mode position
THEN a record with `mode: chaos` and `strategy: "Chaos Mode"` is appended to persistent storage
AND it is present in the same history as live trades

#### Scenario: Close with unknown on-chain outcome
WHEN a close signal is executed but the engine cannot confirm whether the swap landed on-chain
THEN a record is still persisted with `status: unknown`
AND the record is never silently dropped

#### Scenario: Close with unobservable fee
WHEN a close is executed but the on-chain fee cannot be observed
THEN the record SHALL carry `feesUnknown: true`
AND the engine SHALL NOT persist `fees: 0` as if zero fees were the truth

#### Scenario: Restart preserves history
WHEN the bot is stopped and restarted
THEN all previously persisted trade records remain readable

### Requirement: Browsable trade history API

The system SHALL expose a read-only HTTP API that returns persisted trade records with cursor-based pagination and filtering. Supported filters SHALL include: symbol/asset, timeframe, strategy, mode (`live` | `chaos` | all), status, and a time window (`from`/`to` on close timestamp). Responses SHALL include a `hasMore` flag and a `nextCursor` token when more records follow. Records SHALL be ordered by close time descending.

#### Scenario: Fetch first page of history
WHEN a client requests trade history with no filters
THEN the API returns the most recent page of records ordered by close time descending
AND includes `hasMore` and `nextCursor` when additional records exist

#### Scenario: Filter by strategy, timeframe, and asset
WHEN a client requests history filtered by a strategy name, a timeframe, and a symbol
THEN only records matching all three filters are returned

#### Scenario: Filter mode to live only
WHEN a client requests history with `mode: live`
THEN chaos records are excluded from the response

#### Scenario: Paginate forward
WHEN a client requests history with a `nextCursor` from a prior response
THEN the next page of records after that cursor is returned
AND no record is duplicated or skipped across pages

#### Scenario: History readable when bot flag disabled
WHEN the trading bot feature flag is disabled at server startup
THEN trade history (and statistics) remain readable through the API

### Requirement: Statistics API

The system SHALL expose a read-only HTTP API returning aggregate trading metrics over the persisted history. Metrics SHALL include at least: total trades, winning trades, losing trades, win rate, total realized PnL, total gross PnL, total fees, NET PnL (gross minus all fees), average win, average loss, profit factor, best trade, worst trade, average trade, and max drawdown. The API SHALL support grouping the same metrics by strategy script, by timeframe, and by asset, and SHALL accept the same filters as the history API (mode, status, symbol, timeframe, strategy, time window). Groups with zero trades SHALL be omitted. `netPnl` SHALL be computed as `totalGrossPnl - totalFees` using the shared aggregation naming so it reconciles with trade records.

#### Scenario: Global summary
WHEN a client requests statistics with no grouping
THEN the API returns a single global summary with all metrics computed over the full (filtered) history

#### Scenario: Group by strategy
WHEN a client requests statistics grouped by strategy
THEN the API returns one metric group per strategy script, including "Chaos Mode" for chaos trades

#### Scenario: Group by timeframe
WHEN a client requests statistics grouped by timeframe
THEN the API returns one metric group per timeframe

#### Scenario: Group by asset
WHEN a client requests statistics grouped by asset
THEN the API returns one metric group per symbol/asset

#### Scenario: Chaos excluded from live statistics
WHEN a client requests statistics with `mode: live`
THEN chaos trades are excluded from all metrics and groups

### Requirement: Unknown-outcome handling in statistics

The system SHALL compute statistics over confirmed trades by default and SHALL support including unknown-outcome trades via an explicit filter value. Unknown-outcome trades SHALL NOT be silently included in default statistics. Trades flagged `feesUnknown` SHALL be counted in statistics and their fee contribution SHALL NOT be treated as zero by default; the statistics SHALL surface that unknown-fee trades exist.

#### Scenario: Default statistics exclude unknown trades
- **WHEN** a client requests statistics without specifying a status filter
- **THEN** unknown-outcome trades are excluded from the computed metrics

#### Scenario: Explicitly include unknown trades
- **WHEN** a client requests statistics with status filter including `unknown`
- **THEN** unknown-outcome trades are included in the computed metrics

#### Scenario: Unknown-fee trades reported
- **WHEN** the persisted history contains trades with `feesUnknown: true`
- **THEN** statistics SHALL include a count of unknown-fee trades and SHALL NOT report their fee total as a truthful zero

### Requirement: Trade history capacity

The system SHALL tolerate partially corrupt or legacy JSONL lines (records written before strategy/timeframe/mode/status fields existed) without failing reads, and SHALL continue appending new records without re-writing existing ones. The system SHALL keep the history bounded by rotating/archiving beyond a high line count so reads remain fast.

#### Scenario: Legacy record with new fields absent
- **WHEN** a stored record lacks PnL-type fields such as `feesUnknown`, `netPnl`, grossPnl
- **THEN** reads still return the record with those fields treated as unknown/absent
AND statistics do not crash on such records

#### Scenario: Corrupt line in store
- **WHEN** a stored line is not valid JSON
- **THEN** reads skip the corrupt line and continue with the remaining records
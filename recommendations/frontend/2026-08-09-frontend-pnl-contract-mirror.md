# Align frontend default SOL price and PnL field mirror
**Date:** 2026-08-09
**Source:** backend-engineer (M6 backtest rewiring, M5 live executor), tech-lead review
**Priority:** medium
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
1. Update the frontend backtest-commission settings default `solPriceUsd: 150` to `73` to match the new single source `DEFAULT_SOL_USD_PRICE = 73` in `src/strategy/commission-methods/config.ts`.
2. Update `frontend/src/types/trade.ts` mirror of `TradeRecord`/`TradeStats` to include the new fields (`grossPnl`, `feeBreakdown`, `feesUnknown`, `totalGrossPnl`, `feesUnknownTrades`) and relabel `realizedPnl` as NET.

## Rationale
The frontend mirrors the API contract. Post-SSOT, `realizedPnl` is NET (gross − fees) and `fees` is real, but the frontend type still documents GROSS with locked `fees=0`; the stats mirror lacks the two new fields. Without the update, the dashboard can render stale semantics and the type drift invites future gross-vs-net bugs.

## Evidence
- `src/strategy/commission-methods/config.ts` — `DEFAULT_SOL_USD_PRICE = 73` (single source after M6).
- `frontend/src/types/trade.ts` — doc comment still says realizedPnl is GROSS, fees always 0 (pre-M5 contract).
- M7 added `totalGrossPnl`/`feesUnknownTrades` to `TradeStats` — frontend mirror needs them.

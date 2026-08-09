# SOL/USD price feed for live fee conversion
**Date:** 2026-08-09
**Source:** backend-engineer (M5 live executor wiring), integration-engineer (M4 adapters)
**Priority:** medium
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
Add a SOL/USD price feed (or configurable SOL price source) to the live trading path so the live executor can convert lamport-based fee components (PRIORITY, BASE) to quote units and subtract them from net PnL.

## Rationale
The live executor currently has no SOL price at its layer (hardcoding is banned). As a result, live closed trades that carry SOL-side fee components degrade to `feesUnknown` and report `net === gross` (no SOL fee subtraction). The PnL SSOT module is ready to consume a `TokenPrice` map with `SOL: {priceUsd, decimals: 9}` — the only missing piece is the price source. Without it, live net PnL understates real costs by the SOL priority+base fees (small but real).

## Evidence
- `src/trading/live-strategy-executor.ts` `buildCloseFeePrices` (M5) deliberately omits SOL (no feed available at that layer).
- `tests/unit/trading/live-pnl-wiring.test.ts` — SOL-missing-price degradation test proves the honest fallback path.
- The module's `feeToQuote` is the single conversion boundary; it throws on missing mint entries and the executor catches → `feesUnknown`.

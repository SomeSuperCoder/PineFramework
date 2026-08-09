# Multi-hop routes: fees in unpriced intermediate mints understate capture
**Date:** 2026-08-09
**Source:** code-reviewer (M9 re-gate)
**Priority:** low
**Status:** pending
**Effort:** medium (1-4hr)

## Recommendation
On multi-hop routes where a fee lands in a whitelisted but unpriced intermediate mint (not the base/quote token, not SOL), the live executor degrades that component to `feesUnknown` — safe and honest, but fee capture understates on such routes. Add intermediate-mint pricing (via price feed or `signal.expectedPrice` chain) so fees in intermediate mints convert too.

## Rationale
The whitelist admits token-registry mints, but `buildCloseFeePrices` only prices base/quote/USDC/SOL. An intermediate hop fee is dropped to `feesUnknown` rather than converted. Rare (fees are usually in input/output mints), but the understatement is real when it occurs.

## Evidence
- Code reviewer observation 2: "multi-hop routes with fees in unpriced intermediate mints degrade to feesUnknown (whitelisted mint, no price at this layer)."
- `buildCloseFeePrices` supplies prices only for SOL (by construction) + quote/base tokens; `feeToQuote` throws on unpriced whitelisted mints → caught → degrade (inside try, safe).

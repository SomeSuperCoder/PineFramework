# math.asin/acos TV parity — |x|>1 should return na, not clamp
**Date:** 2026-08-17
**Source:** QA Engineer (M4 audit)
**Priority:** low
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Change `math.asin`/`math.acos` to return `NA` for |x| > 1 instead of clamping to [-1, 1] (`math.asin(2)` currently → π/2 via clamp). TradingView/Pine semantics return `na` for out-of-domain arcsine/arccosine; decimal.js natively returns NaN for `asin(2)` (which collapses to NA at the boundary), so removing the clamp is a one-line change per builtin.

## Rationale
The clamp is a pre-existing legacy convention (byte-identical in `3f71177`) that M4 preserved — but it is a legitimate TV divergence. Per the user's directive, divergences are classified, not silently changed. QA ruled: ship M4 as-is, gate this parity fix as a follow-up. decimal.js `asin(2)` → NaN → boundary NA, so the fix is trivial and safe.

## Evidence
- `git show 3f71177:src/language/runtime/builtins/math-builtins.ts` — clamp `Math.max(-1, Math.min(1, v))` present in legacy
- QA audit (m4-audit.json): "legacy was ALSO clamp... TV divergence confirmed: decimal.js natively returns NaN for asin(2)... Ruling: ship as-is + GATED FOLLOW-UP"
- Test Engineer flagged in m4-verification.json: shipped `math.asin(2)` → π/2 (clamp), suite asserts shipped contract
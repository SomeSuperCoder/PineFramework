# Proposal: IEEE 754 Arithmetic Bug Audit

## Scope

Exhaustive audit of all IEEE 754 floating-point arithmetic operations across the pine-framework codebase. This audit targets the core runtime (Pine Script execution engine), technical analysis functions, strategy/backtesting engine, commission calculator, and all mathematical/statistical operations.

## Methodology

1. Every file containing arithmetic operations was read in full.
2. Every arithmetic expression was analyzed for IEEE 754 correctness.
3. Every equality/comparison on floats was evaluated for epsilon sensitivity.
4. Every mathematical function was checked for NaN/Infinity propagation.
5. Every recursive/cumulative calculation was analyzed for precision drift.
6. Test coverage was reviewed for edge cases related to floating-point.

## Key Findings Summary

**Critical Issues Found:**
- No guards for IEEE 754 NaN (as opposed to the NA Symbol) — NaN silently poisons all calculations since `isNa()` only checks for the NA Symbol, not JavaScript NaN
- `math.round` has well-known binary rounding artifacts (1.005 rounds to 1 instead of 1.01)
- Catastrophic cancellation in `correlation()` and `linreg()` formulas
- RingBuffer running-sum drift accumulates over long time-series

**High Severity Issues Found:**
- `math.log`/`math.sqrt`/`math.asin`/`math.acos` return JavaScript NaN/Infinity instead of Pine Script NA
- RMA, EMA floating-point accumulation errors compound over thousands of bars
- `===` float comparison for `==` operator in Pine Script execution
- Catastrophic cancellation in Pearson correlation coefficient calculation
- `isValidNumber` passes Infinity through as valid
- No epsilon-aware float comparisons anywhere

**Medium Severity Issues Found:**
- Strategy avgPrice drifts with partial fills
- EMA K-factor non-terminating binary fraction causes per-bar precision loss
- RSI pathologically small loss bypasses zero-check branch
- Compound assignments propagate NaN/Infinity unchecked
- Crossover/crossunder float comparison misses near-equal cross events
- Stoch/MFI strict zero-comparison bypasses div-by-zero guard
- NaN propagation from IEEE 754 operations through Pine Script runtime unchecked
- `hl2`/`hlc3`/`ohlc4` unsound `as number` cast on NA Symbol

## Risk Assessment

| Category | Risk Level |
|----------|-----------|
| Silent data corruption in indicators | HIGH |
| Incorrect RSI/Stoch values near zero | MEDIUM |
| Strategy metric inflation (Sharpe/Sortino) | MEDIUM |
| Backtest equity curve errors | MEDIUM |
| Crossover signal misdetection | MEDIUM |
| Commission calculation rounding | LOW |

## Recommended Approach

1. Add post-arithmetic NaN/Infinity → NA conversion in expression executor
2. Replace textbook-statistics formulas with numerically stable variants
3. Add epsilon-aware comparison utilities for float-sensitive operations
4. Fix `math.round` to use banker's rounding / Pine-compatible rounding
5. Add clamping and guard checks to math builtins
6. Add NaN propagation guard in `isValidNumber`
7. Fix RingBuffer to recalculate sum periodically
8. Add comprehensive IEEE 754 edge case tests
